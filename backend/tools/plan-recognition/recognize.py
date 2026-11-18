"""Offline, bounded geometric candidate extraction. No AI, network, or invented fixture output."""
import json
import math
import os
import sys
import warnings
from pathlib import Path

import cv2
import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 40_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
cv2.setNumThreads(1)
COLORS = dict(wall='#536460', rack='#a7ccdf', door='#d6c3a7', aisle='#f2e7bd', zone='#dbeee6', shape='#dfece7')


def suppress_notebook_rules(normalized, mask):
    """Remove only faint, long, regularly repeated paper rules from the analysis mask.

    Geometry alone cannot distinguish a wall from a notebook line. Require at least
    six evenly spaced lines spanning the page, and preserve darker overlaid pen ink,
    including strokes parallel to a rule. The preview/source pixels stay untouched.
    """
    h, w = mask.shape; scale = min(w, h)
    raw = cv2.HoughLinesP(mask, 1, np.pi/720, max(35, int(scale*.12)),
                          minLineLength=scale*.55, maxLineGap=scale*.025)
    if raw is None: return mask, 0
    clean = mask.copy(); removed = 0
    for horizontal in (True, False):
        length, breadth = (w, h) if horizontal else (h, w)
        evidence = []
        for x1, y1, x2, y2 in raw.reshape(-1, 4):
            a, b, c, d = (x1, x2, y1, y2) if horizontal else (y1, y2, x1, x2)
            if abs(b-a) < length*.40 or abs(d-c) > abs(b-a)*.22: continue
            slope = (d-c)/(b-a)
            evidence.append((slope, c+slope*(length/2-a), abs(b-a)))
        if len(evidence) < 6: continue
        slope = float(np.median([e[0] for e in evidence]))
        lines = []
        for m, axis, extent in sorted(evidence, key=lambda e: e[1]):
            if abs(m-slope) > .02: continue
            if lines and abs(lines[-1][0]-axis) < max(3, scale*.005):
                old, weight, tilt = lines[-1]
                lines[-1] = ((old*weight+axis*extent)/(weight+extent), weight+extent, (tilt*weight+m*extent)/(weight+extent))
            else: lines.append((axis, extent, m))
        if len(lines) < 6: continue
        axes = np.array([line[0] for line in lines]); gaps = np.diff(axes)
        spacing = float(np.median(gaps))
        if not scale*.012 <= spacing <= scale*.14: continue
        regular = np.abs(gaps-spacing) <= max(2.5, spacing*.15)
        supported = np.r_[regular, False] | np.r_[False, regular]
        # Isolated pairs do not constitute a ruled page.
        edges = np.diff(np.r_[False, regular, False].astype(np.int8))
        runs = np.where(edges == -1)[0]-np.where(edges == 1)[0]
        if not len(runs) or max(runs) < 5: continue
        if np.ptp(axes[supported]) < breadth*.45: continue
        view = normalized if horizontal else normalized.T
        target = clean if horizontal else clean.T
        t = np.arange(length)
        radius = max(3, int(scale*.004))
        profiles = []
        for index in np.flatnonzero(supported):
            axis, _, tilt = lines[index]
            centers = np.rint(axis+tilt*(t-length/2)).astype(int)
            rows = centers[None, :]+np.arange(-radius, radius+1)[:, None]
            valid = (rows >= 0) & (rows < breadth)
            rows = np.clip(rows, 0, breadth-1)
            tones = np.where(valid, view[rows, t], 255)
            darkest = tones.min(axis=0)
            ink = darkest[darkest < 215]
            if len(ink) >= length*.4: profiles.append((rows, valid, tones, float(np.median(ink)), len(ink)/length))
        faint = [tone for _, _, _, tone, coverage in profiles if tone >= 135 and coverage >= .7]
        # A dark, repeated CAD structure alone is not identifiable as notebook paper.
        if len(faint) < 6: continue
        paper_tone = float(np.median(faint))
        for rows, valid, tones, tone, _ in profiles:
            # A wall can cover most of a rule. Use the other rules to remove its
            # faint extension through the doorway, while preserving the dark wall.
            cutoff = (tone if tone >= 135 else paper_tone)-24
            erase = valid & (tones >= cutoff) & (target[rows, t] > 0)
            target[rows[erase], np.broadcast_to(t, rows.shape)[erase]] = 0
            removed += int(erase.any())
    return clean, removed


def ink_mask(image, with_rules=False):
    """Local illumination normalization, then conservative ruled-paper suppression."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    scale = min(gray.shape)
    size = max(15, int(scale * .035) | 1)
    background = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size)))
    normalized = cv2.divide(gray, np.maximum(background, 1), scale=255)
    mask = cv2.threshold(normalized, 215, 255, cv2.THRESH_BINARY_INV)[1]
    mask, rules = suppress_notebook_rules(normalized, mask)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    keep = np.zeros(count, dtype=np.uint8)
    keep[1:] = np.where(stats[1:, cv2.CC_STAT_AREA] >= max(3, scale * .005), 255, 0)
    result = keep[labels]
    return (result, rules) if with_rules else result


def correct_page(image):
    """Rectify only a bright paper quadrilateral with a darker surrounding background.
    A warehouse outline on white paper is deliberately NOT a page boundary.
    """
    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (9, 9), 0)
    threshold, _ = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    options = []
    for value in (threshold, max(80, threshold - 30)):
        mask = cv2.threshold(blurred, value, 255, cv2.THRESH_BINARY)[1]
        # Stay just inside the detected paper edge: a dark photographic rim
        # must not become an extra outer wall after perspective correction.
        mask = cv2.erode(mask, np.ones((5, 5), np.uint8))
        for c in cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
            a = cv2.contourArea(c)
            if not .35 * w * h < a < .94 * w * h: continue
            q = cv2.approxPolyDP(c, .018 * cv2.arcLength(c, True), True)
            if len(q) != 4 or not cv2.isContourConvex(q): continue
            pts = q.reshape(-1, 2).astype(np.float32)
            if np.any(pts[:, 0] < 3) or np.any(pts[:, 0] > w-4) or np.any(pts[:, 1] < 3) or np.any(pts[:, 1] > h-4): continue
            region = np.zeros_like(gray); cv2.fillConvexPoly(region, q, 255)
            inside = cv2.erode(region, np.ones((15, 15), np.uint8)) > 0
            outside = cv2.dilate(region, np.ones((15, 15), np.uint8)) == 0
            if not outside.any() or np.median(gray[inside]) < np.median(gray[outside]) + 30: continue
            # Cyclic ordering preserves the photographed orientation, including 90-degree pages.
            center = pts.mean(axis=0)
            pts = pts[np.argsort(np.arctan2(pts[:, 1]-center[1], pts[:, 0]-center[0]))]
            pts = np.roll(pts, -np.argmin(pts.sum(axis=1)), axis=0)
            edges = np.roll(pts, -1, axis=0) - pts
            cosines = [abs(np.dot(edges[i], edges[(i+1)%4]) / (np.linalg.norm(edges[i])*np.linalg.norm(edges[(i+1)%4]))) for i in range(4)]
            if max(cosines) > .65: continue
            options.append((a, pts))
    notices = []
    if options:
        _, pts = max(options, key=lambda item: item[0])
        tw = int(max(np.linalg.norm(pts[1]-pts[0]), np.linalg.norm(pts[2]-pts[3])))
        th = int(max(np.linalg.norm(pts[3]-pts[0]), np.linalg.norm(pts[2]-pts[1])))
        transform = cv2.getPerspectiveTransform(pts, np.float32([[0, 0], [tw-1, 0], [tw-1, th-1], [0, th-1]]))
        image = cv2.warpPerspective(image, transform, (tw, th), borderValue=(255, 255, 255))
        notices.append('종이 경계를 기준으로 원근을 보정했습니다. 실제 축척은 알 수 없으므로 원본과 배치를 비교해 주세요.')
    mask = ink_mask(image); h, w = mask.shape
    lines = cv2.HoughLinesP(mask, 1, np.pi/720, max(25, int(min(w,h)*.08)), minLineLength=min(w,h)*.18, maxLineGap=min(w,h)*.01)
    angles, lengths = [], []
    if lines is not None:
        for x1, y1, x2, y2 in lines.reshape(-1, 4):
            length = math.hypot(x2-x1, y2-y1)
            angle = ((math.degrees(math.atan2(y2-y1, x2-x1)) + 45) % 90) - 45
            if abs(angle) <= 12: angles.append(angle); lengths.append(length)
    if len(angles) >= 4:
        order = np.argsort(angles); weights = np.array(lengths)[order]
        angle = np.array(angles)[order][np.searchsorted(np.cumsum(weights), weights.sum()/2)]
        agreement = sum(length for a,length in zip(angles,lengths) if abs(a-angle)<2) / sum(lengths)
        if .5 < abs(angle) <= 12 and agreement >= .65:
            matrix = cv2.getRotationMatrix2D((w/2, h/2), float(angle), 1)
            c, s = abs(matrix[0,0]), abs(matrix[0,1]); nw, nh = math.ceil(h*s+w*c), math.ceil(h*c+w*s)
            matrix[0,2] += (nw-w)/2; matrix[1,2] += (nh-h)/2
            image = cv2.warpAffine(image, matrix, (nw, nh), borderValue=(255,255,255))
            notices.append(f'긴 선의 공통 기울기 {angle:.1f}°를 보정했습니다. 위·아래 방향은 회전 버튼으로 확인하세요.')
    return image, notices


def wall_segments(mask):
    """Group jittered line evidence, then read actual ink runs to preserve openings."""
    h, w = mask.shape; scale = min(w,h); tolerance = max(4, scale*.009)
    lines = cv2.HoughLinesP(mask, 1, np.pi/360, max(20,int(scale*.06)), minLineLength=scale*.14, maxLineGap=scale*.012)
    groups = []
    if lines is None: return [], None
    for x1,y1,x2,y2 in lines.reshape(-1, 4):
        dx,dy=x2-x1,y2-y1; horizontal=abs(dx)>abs(dy)
        if min(abs(dx),abs(dy)) > max(abs(dx),abs(dy))*.12: continue
        axis=(y1+y2)/2 if horizontal else (x1+x2)/2
        start,end=sorted((x1,x2) if horizontal else (y1,y2))
        group=next((g for g in groups if g[0]==horizontal and abs(g[1]-axis)<=tolerance),None)
        if group is None: groups.append([horizontal,axis,start,end,1])
        else:
            group[1]=(group[1]*group[4]+axis)/(group[4]+1);group[2]=min(group[2],start);group[3]=max(group[3],end);group[4]+=1
    hs=[g for g in groups if g[0] and g[3]-g[2]>w*.3]
    vs=[g for g in groups if not g[0] and g[3]-g[2]>h*.3]
    frame=None
    if len(hs)>=2 and len(vs)>=2:
        left,right=min(g[1] for g in vs),max(g[1] for g in vs)
        top,bottom=min(g[1] for g in hs),max(g[1] for g in hs)
        if right-left>w*.45 and bottom-top>h*.35: frame=(left,top,right,bottom)
    walls=[]
    for horizontal,axis,start,end,_ in groups:
        if frame:
            boundaries=(frame[1],frame[3]) if horizontal else (frame[0],frame[2])
            if min(abs(axis-edge) for edge in boundaries)>tolerance*2: continue
        elif end-start < (w if horizontal else h)*.4: continue
        band=mask[max(0,int(axis-tolerance)):min(h,int(axis+tolerance+1)),:] if horizontal else mask[:,max(0,int(axis-tolerance)):min(w,int(axis+tolerance+1))].T
        if not band.size: continue
        projection=np.any(band>0,axis=0).astype(np.uint8)*255
        # At most a pen-width crack; never bridge an entrance-sized gap.
        projection=cv2.morphologyEx(projection[None,:],cv2.MORPH_CLOSE,np.ones((1,max(3,int(scale*.005)|1)),np.uint8))[0]
        edges=np.diff(np.r_[0,projection>0,0].astype(np.int8));starts=np.where(edges==1)[0];ends=np.where(edges==-1)[0]
        for a,b in zip(starts,ends):
            if b-a<scale*.065 or b<start-tolerance or a>end+tolerance: continue
            width=max(3,float(np.median(np.count_nonzero(band[:,a:b],axis=0))))
            wall=(horizontal,float(a),float(axis-width/2),float(b-a),width) if horizontal else (horizontal,float(axis-width/2),float(a),width,float(b-a))
            if not any(g[0]==wall[0] and abs(g[1]-wall[1])+abs(g[2]-wall[2])+abs(g[3]-wall[3])+abs(g[4]-wall[4])<tolerance*3 for g in walls): walls.append(wall)
    return walls, frame


def stroke_groups(mask):
    """Group collinear evidence without requiring a closed contour or rectangular warehouse."""
    h,w=mask.shape;scale=min(w,h)
    raw=cv2.HoughLinesP(mask,1,np.pi/720,max(25,int(scale*.045)),minLineLength=scale*.09,maxLineGap=scale*.02)
    groups=[]
    if raw is None:return groups
    for x1,y1,x2,y2 in sorted(raw.reshape(-1,4),key=lambda l:-math.hypot(l[2]-l[0],l[3]-l[1])):
        a=np.float64([x1,y1]);b=np.float64([x2,y2]);v=b-a;length=np.linalg.norm(v);u=v/length
        if u[0]<0 or (abs(u[0])<.01 and u[1]<0):u=-u
        found=None
        for g in groups:
            if abs(np.dot(u,g['u']))<math.cos(math.radians(9)):continue
            n=np.array([-g['u'][1],g['u'][0]])
            if abs(np.dot((a+b)/2-g['center'],n))>scale*.014:continue
            t=np.dot(np.stack([a,b])-g['center'],g['u']);gt=np.dot(g['points']-g['center'],g['u'])
            if max(t.min(),gt.min())-min(t.max(),gt.max())>scale*.025:continue
            found=g;break
        if found is None:groups.append(dict(points=np.stack([a,b]),center=(a+b)/2,u=u))
        else:
            found['points']=np.vstack([found['points'],a,b]);points=found['points'];center=points.mean(axis=0)
            _,_,vh=np.linalg.svd(points-center,full_matrices=False);u=vh[0]
            if u[0]<0 or (abs(u[0])<.01 and u[1]<0):u=-u
            found.update(center=center,u=u)
    for g in groups:
        t=np.dot(g['points']-g['center'],g['u']);g['a']=g['center']+g['u']*t.min();g['b']=g['center']+g['u']*t.max();g['length']=t.max()-t.min()
    return groups


def partial_rectangles(mask,groups):
    """Paired opposite strokes plus side evidence. Text alone is never a boundary."""
    h,w=mask.shape;scale=min(w,h);result=[]
    expanded=cv2.dilate(mask,np.ones((max(7,int(scale*.024)|1),)*2,np.uint8))
    for i,a in enumerate(groups):
        for b in groups[i+1:]:
            if abs(np.dot(a['u'],b['u']))<math.cos(math.radians(12)):continue
            u=a['u'];n=np.array([-u[1],u[0]]);distance=abs(np.dot(b['center']-a['center'],n))
            if not scale*.04<distance<scale*.5:continue
            ta=np.dot(np.stack([a['a'],a['b']]),u);tb=np.dot(np.stack([b['a'],b['b']]),u)
            overlap=min(ta.max(),tb.max())-max(ta.min(),tb.min())
            if overlap<min(a['length'],b['length'])*.8 or min(a['length'],b['length'])/max(a['length'],b['length'])<.65:continue
            lo=min(ta.min(),tb.min());hi=max(ta.max(),tb.max());width=hi-lo
            if not 1.2<width/distance<7 or width>max(w,h)*.5:continue
            center=u*(lo+hi)/2+n*np.dot((a['center']+b['center'])/2,n)
            angle=math.degrees(math.atan2(u[1],u[0]));r=(*center,width,distance,angle,width*distance)
            points=cv2.boxPoints(((float(center[0]),float(center[1])),(float(width),float(distance)),angle));coverage=[]
            for j in range(4):
                samples=points[j]+np.linspace(.07,.93,80)[:,None]*(points[(j+1)%4]-points[j]);xs=np.clip(samples[:,0].astype(int),0,w-1);ys=np.clip(samples[:,1].astype(int),0,h-1)
                coverage.append(float(np.mean(expanded[ys,xs]>0)))
            if min(coverage)>.38 and sum(v>.65 for v in coverage)>=3:result.append(r)
    return result


def boundary_strokes(groups,mask):
    """Evidence-only boundary segments. No completion of missing sides."""
    h,w=mask.shape;scale=min(w,h)
    hs=[g for g in groups if abs(g['u'][1])<.32 and g['length']>scale*.18]
    vs=[g for g in groups if abs(g['u'][0])<.32 and g['length']>scale*.18]
    if not hs or len(vs)<2:return [],None
    left=min(vs,key=lambda g:g['center'][0]);right=max(vs,key=lambda g:g['center'][0]);top=min(hs,key=lambda g:g['center'][1])
    lx,rx=left['center'][0],right['center'][0]
    if rx-lx<scale*.35:return [],None
    # A sloping bottom is referenced to the observed ends of the side walls.
    ly=max(left['a'][1],left['b'][1]);ry=max(right['a'][1],right['b'][1]);ty=min(top['a'][1],top['b'][1]);bottom=max(ly,ry)
    if bottom-ty<scale*.25:return [],None
    selected=[]
    for g in groups:
        x,y=g['center'];horizontal=abs(g['u'][1])<.32;vertical=abs(g['u'][0])<.32
        by=ly+(ry-ly)*(x-lx)/(rx-lx)
        if (vertical and min(abs(x-lx),abs(x-rx))<scale*.03) or (horizontal and (abs(y-top['center'][1])<scale*.04 or abs(y-by)<scale*.08)):
            selected.append(g)
    return selected,(lx,ty,rx,bottom)


def render(path, output, page=0, rotation=0):
    count = 1
    if path.suffix == '.pdf':
        with pdfium.PdfDocument(path) as pdf:
            count = len(pdf)
            if not 1 <= count <= 30 or not 0 <= page < count:
                raise ValueError('PDF 페이지는 최대 30개이며 선택한 페이지가 있어야 합니다.')
            p = pdf[page]
            try:
                width, height = p.get_size()
                if not all(math.isfinite(n) and 1 <= n <= 50000 for n in (width, height)):
                    raise ValueError('PDF 페이지 크기를 확인해 주세요.')
                bitmap = p.render(scale=min(3, 1800 / max(width, height)), may_draw_forms=False)
                image = bitmap.to_pil().convert('RGB').copy()
                bitmap.close()
            finally:
                p.close()
    else:
        with Image.open(path) as original:
            expected = {'.png':'PNG', '.jpg':'JPEG', '.jpeg':'JPEG', '.webp':'WEBP'}[path.suffix]
            if original.format != expected or getattr(original, 'n_frames', 1) != 1:
                raise ValueError('실제 이미지 형식이 다르거나 애니메이션 이미지입니다.')
            width, height = original.size
            if min(width, height) < 64 or width * height > 40_000_000:
                raise ValueError('이미지는 최소 64px, 최대 4천만 화소까지 지원합니다.')
            image = ImageOps.exif_transpose(original).convert('RGBA')
            bg = Image.new('RGBA', image.size, 'white'); bg.alpha_composite(image); image = bg.convert('RGB')
    image = image.rotate(-rotation, expand=True)
    original_size = image.size
    image.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
    corrected, corrections = correct_page(cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR))
    image = Image.fromarray(cv2.cvtColor(corrected, cv2.COLOR_BGR2RGB))
    image.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
    ratio = image.width / image.height
    if not .25 <= ratio <= 4:
        raise ValueError('가로세로 비율 1:4~4:1 범위의 도면 페이지를 선택해 주세요.')
    image.save(output, 'PNG')
    return dict(pageCount=count, width=image.width, height=image.height, sourceWidth=original_size[0], sourceHeight=original_size[1], aspectRatio=ratio,
                warnings=corrections + ['실제 거리와 랙 단수·칸수는 추정하지 않습니다.', '문자 방향은 자동 확정하지 않습니다. 좌우 회전으로 원본 방향을 확인하세요.'] + (['해상도가 낮아 작은 구조를 놓칠 수 있습니다.'] if min(image.size)<500 else []))


def recognize_geometry(image):
    h, w = image.shape[:2]; area = w*h
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mask, rules = ink_mask(image, with_rules=True)
    rule_notices = (['반복되는 옅은 노트 줄무늬를 분석에서 제외했습니다. 겹친 펜 선과 흐린 선은 원본과 비교해 확인해 주세요.'] if rules else [])
    # Conservative rejection of photographic/continuous-tone pages: geometric line extraction
    # on warehouse photographs produces convincing but meaningless walls. Ask for a plan crop.
    quantized = (image[::3, ::3] // 32).reshape(-1, 3)
    _, frequencies = np.unique(quantized, axis=0, return_counts=True)
    dominant = sum(sorted(frequencies, reverse=True)[:12]) / len(quantized)
    if dominant < .78 and np.mean((gray > 40) & (gray < 220)) > .30 and np.mean(mask > 0) > .09:
        return dict(objects=[], width=w, height=h, aspectRatio=w/h, warnings=[
            '사진 또는 연속 색조가 많은 페이지로 판단해 자동 객체 생성을 중단했습니다. 평면 도면 영역만 잘라 업로드하거나 다른 페이지를 선택하세요.',
            '종이의 네 모서리가 보이도록 촬영하거나 도면 영역만 잘라 다시 업로드하세요.'])
    candidates = []

    def add(kind, box, confidence, evidence, angle=0):
        cx, cy, bw, bh = box
        if bw < w*.005 or bh < h*.005:  # editor minimum thickness, not a physical dimension
            bw, bh = max(bw,w*.005), max(bh,h*.005)
        if not (0 <= cx <= w and 0 <= cy <= h and bw <= w and bh <= h): return
        if len(candidates) >= 450: return
        candidates.append(dict(type=kind, x=cx/w, y=cy/h, width=bw/w, height=bh/h, rotation=angle,
                               fill=COLORS[kind], shape='rectangle', label='', confidence=confidence, evidence=evidence, reviewRequired=True))

    walls, frame = wall_segments(mask)
    groups=stroke_groups(mask)
    boundary,loose_frame=boundary_strokes(groups,mask)
    incomplete=frame is None
    if incomplete and loose_frame: frame=loose_frame
    for horizontal,x,y,bw,bh in walls:
        add('wall',(x+bw/2,y+bh/2,bw,bh),.78,'outer-boundary-line')

    # Rectangular outlines: supported elongated outlines inside the outer wall, or repeated rack geometry.
    rectangles=[]
    close_size=max(3,int(min(w,h)*.02)|1)
    outlines=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(close_size,close_size)))
    for contour in cv2.findContours(outlines,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)[0]:
        a=cv2.contourArea(contour)
        if not area*.002 < a < area*.16: continue
        rect=cv2.minAreaRect(contour); (cx,cy),(bw,bh),angle=rect
        if min(bw,bh)<max(14,min(w,h)*.025) or a/max(bw*bh,1)<.72: continue
        approx=cv2.approxPolyDP(contour,.025*cv2.arcLength(contour,True),True)
        if not 4<=len(approx)<=6: continue
        if bw<bh: bw,bh=bh,bw;angle+=90
        angle=((angle+90)%180)-90
        if max(bw,bh)>max(w,h)*.65: continue
        rectangles.append((cx,cy,bw,bh,angle,a))
    rectangles.extend(partial_rectangles(mask,groups))
    # Suppress inner outlines/bay cells and duplicate sides of the same stroke.
    boxes=[]
    for r in sorted(rectangles,key=lambda r:-r[5]):
        cx,cy,bw,bh,angle,a=r
        duplicate=False
        for q in boxes:
            dx,dy=cx-q[0],cy-q[1];rad=math.radians(-q[4]);lx=dx*math.cos(rad)-dy*math.sin(rad);ly=dx*math.sin(rad)+dy*math.cos(rad)
            if abs(lx)+bw*.40<q[2]*.53 and abs(ly)+bh*.40<q[3]*.53: duplicate=True;break
        if not duplicate: boxes.append(r)
    boundary_doors=[]
    if incomplete and frame:
        for r in boxes:
            cx,cy,bw,bh,angle,a=r
            # A framed opening must lie near the perimeter and connect to strokes on both ends.
            if bw/bh<2 or cy<frame[1]+(frame[3]-frame[1])*.65:continue
            rad=math.radians(angle);u=np.array([math.cos(rad),math.sin(rad)]);ends=[np.array([cx,cy])-u*bw/2,np.array([cx,cy])+u*bw/2]
            adjacent=[]
            for end in ends:
                adjacent.append(any(min(np.linalg.norm(end-g['a']),np.linalg.norm(end-g['b']))<min(w,h)*.09 and abs(np.dot(g['u'],u))>.9 and np.linalg.norm(g['center']-[cx,cy])>bw*.5 for g in boundary))
            if all(adjacent):boundary_doors.append(r)
        candidates.clear();walls=[]
        for g in boundary:
            # Exclude the box drawn to label an entrance: it must not block the opening.
            if any(abs(np.dot(g['center']-np.array(r[:2]),np.array([math.cos(math.radians(r[4])),math.sin(math.radians(r[4]))])))<r[2]*.55 and abs(np.dot(g['center']-np.array(r[:2]),np.array([-math.sin(math.radians(r[4])),math.cos(math.radians(r[4]))])))<r[3]*.7 for r in boundary_doors):continue
            angle=math.degrees(math.atan2(g['u'][1],g['u'][0]));add('wall',(*((g['a']+g['b'])/2),g['length'],max(4,min(w,h)*.007)),.55,'observed-boundary-stroke',angle)
        for r in boundary_doors:add('door',r[:4],.45,'boundary-framed-opening',r[4])
    racks=[]
    expanded=cv2.dilate(mask,np.ones((max(7,int(min(w,h)*.024)|1),)*2,np.uint8))
    for r in boxes[:300]:
        cx,cy,bw,bh,angle,a=r
        peers=[q for q in boxes if q is not r and abs(q[2]-bw)<bw*.22 and abs(q[3]-bh)<bh*.25 and abs(q[4]-angle)<8 and math.hypot(q[0]-cx,q[1]-cy)<max(bw,bh)*5]
        # Perspective/unsupported symbols remain unclassified instead of silently becoming racks.
        inside = frame is not None and frame[0]+min(w,h)*.025 < cx < frame[2]-min(w,h)*.025 and frame[1]+min(w,h)*.025 < cy < frame[3]-min(w,h)*.025
        # Require outline ink on each side, not a bounding box around handwriting.
        points=cv2.boxPoints(((cx,cy),(bw,bh),angle));coverage=[]
        for i in range(4):
            samples=points[i]+np.linspace(.08,.92,80)[:,None]*(points[(i+1)%4]-points[i])
            xs=np.clip(samples[:,0].astype(int),0,w-1);ys=np.clip(samples[:,1].astype(int),0,h-1)
            coverage.append(float(np.mean(expanded[ys,xs]>0)))
        supported=min(coverage)>=.30 and sum(v>.65 for v in coverage)>=3
        touches_wall=any(abs(cx-(x+ww/2))<ww/2+min(bw,bh)/2 and abs(cy-(y+hh/2))<hh/2+min(bw,bh)/2 for _,x,y,ww,hh in walls)
        if any(math.hypot(cx-d[0],cy-d[1])<min(bw,d[2])*.3 for d in boundary_doors):continue
        if supported and not touches_wall and ((inside and bw/bh>=1.25) or (len(peers)>=2 and bw/bh>=1.5)):
            racks.append(r);add('rack',(cx,cy,bw,bh),round(.55+.25*min(coverage),2),'interior-rack-outline' if inside else 'repeated-elongated-rectangles',angle)
        elif supported and not any(abs(cx-(x+ww/2))<ww/2 and abs(cy-(y+hh/2))<hh/2 for _,x,y,ww,hh in walls):
            add('shape',(cx,cy,bw,bh),.25,'unclassified-rectangle',angle)

    # Empty strips BETWEEN repeated parallel rack symbols, not arbitrary white page margins.
    aisles=[]
    for i,a in enumerate(racks):
        for b in racks[i+1:]:
            if abs(a[4]-b[4])>5 or min(abs(a[4]),abs(abs(a[4])-90))>5:continue
            vertical=abs(a[4])>45
            ax,ay,aw,ah=a[:4];bx,by,bw,bh=b[:4]
            if vertical: aw,ah=ah,aw;bw,bh=bh,bw
            if vertical:
                left,right=sorted([(ax,ay,aw,ah),(bx,by,bw,bh)])
                x1=left[0]+left[2]/2;x2=right[0]-right[2]/2;y1=max(ay-ah/2,by-bh/2);y2=min(ay+ah/2,by+bh/2)
                if y2-y1<min(ah,bh)*.65:continue
            else:
                top,bottom=sorted([(ay,ax,ah,aw),(by,bx,bh,bw)])
                y1=top[0]+top[2]/2;y2=bottom[0]-bottom[2]/2;x1=max(ax-aw/2,bx-bw/2);x2=min(ax+aw/2,bx+bw/2)
                if x2-x1<min(aw,bw)*.65:continue
            if min(x2-x1,y2-y1)<min(w,h)*.015 or min(x2-x1,y2-y1)>min(w,h)*.15:continue
            region=mask[max(0,int(y1)+3):int(y2)-3,max(0,int(x1)+3):int(x2)-3]
            if not region.size or np.count_nonzero(region)/region.size>.035:continue
            box=((x1+x2)/2,(y1+y2)/2,x2-x1,y2-y1)
            if any(abs(box[0]-q[0])+abs(box[1]-q[1])<8 for q in aisles):continue
            aisles.append(box);add('aisle',box,.40,'free-strip-between-racks')

    # Openings in collinear wall strokes. These are tentative entrances, not confirmed doors.
    doors=[]
    for i,a in enumerate(walls):
        for b in walls[i+1:]:
            if a[0]!=b[0]:continue
            horizontal=a[0]
            aa=(a[1],a[2],a[3],a[4]) if horizontal else (a[2],a[1],a[4],a[3])
            bb=(b[1],b[2],b[3],b[4]) if horizontal else (b[2],b[1],b[4],b[3])
            left,right=sorted([aa,bb]);gap=right[0]-left[0]-left[2]
            if abs(left[1]-right[1])>max(left[3],right[3])+3 or not min(w,h)*.025<gap<min(w,h)*.25:continue
            x=left[0]+left[2]+gap/2;y=(left[1]+right[1])/2+max(left[3],right[3])/2
            box=(x,y,gap,max(left[3],right[3])) if horizontal else (y,x,max(left[3],right[3]),gap)
            if any(abs(box[0]-q[0])+abs(box[1]-q[1])<8 for q in doors):continue
            doors.append(box);add('door',box,.45,'gap-between-wall-segments')

    # Colored bounded regions can be zone candidates, but no inferred operational purpose/name.
    hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    colored=cv2.inRange(hsv,np.array([0,25,110]),np.array([179,210,255]))
    for contour in cv2.findContours(colored,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)[0]:
        x,y,bw,bh=cv2.boundingRect(contour);a=cv2.contourArea(contour)
        if area*.025<a<area*.65 and a/(bw*bh)>.8 and min(bw,bh)>min(w,h)*.1:
            add('zone',(x+bw/2,y+bh/2,bw,bh),.35,'bounded-color-region')
    candidates.sort(key=lambda o:({'zone':0,'aisle':1,'wall':2,'door':3,'shape':4,'rack':5}[o['type']],o['y'],o['x']))
    return dict(objects=candidates, width=w,height=h,aspectRatio=w/h,engine='opencv-geometric-v1',ocr='not-configured',ai='not-connected',
                warnings=rule_notices + ['모든 결과는 사용자 확인이 필요한 기하학 후보입니다. 신뢰도는 보정된 정확도 확률이 아닙니다.',
                          'OCR·외부 AI 미연동: 랙 코드, 구역 용도, 실제 치수는 자동 확정하지 않습니다.',
                          '벽의 틈은 출입구 후보일 뿐입니다. 작은 끊김·곡선·불명확한 사각형은 원본과 비교해 수정하세요.'] + ([] if candidates else ['구조 후보를 찾지 못했습니다. 페이지·방향·해상도를 확인하거나 직접 편집하세요.']))


def recognize(path):
    image=cv2.imread(str(path));h,w=image.shape[:2];mask=ink_mask(image)
    # Analyze a fragmented boundary from its strongest side. Restore every coordinate to
    # the displayed image afterwards: this is NOT a guess about handwriting orientation.
    turns=0
    if wall_segments(mask)[1] is None:
        groups=stroke_groups(mask)
        if groups:
            edge=max(groups,key=lambda g:g['length']);centers=np.array([g['center'] for g in groups]);mid=(centers.min(axis=0)+centers.max(axis=0))/2
            if abs(edge['u'][0])>=abs(edge['u'][1]):turns=2 if edge['center'][1]>mid[1] else 0
            else:turns=1 if edge['center'][0]<mid[0] else 3
    rotated=np.rot90(image,-turns).copy() if turns else image
    result=recognize_geometry(rotated);rh,rw=rotated.shape[:2]
    for obj in result['objects']:
        x,y=obj['x'],obj['y']
        for _ in range(turns):x,y=y,1-x
        bw,bh=obj['width']*rw,obj['height']*rh;angle=obj['rotation']-90*turns
        if bw>w or bh>h:bw,bh=bh,bw;angle+=90
        obj.update(x=float(x),y=float(y),width=float(bw/w),height=float(bh/h),rotation=float((angle+180)%360-180))
    kinds=[o['type'] for o in result['objects']]
    if kinds and ('rack' not in kinds or 'door' not in kinds or kinds.count('wall')<3):
        result['warnings'].insert(0,'부분 인식: 벽·랙·출입구의 누락 여부를 확인하세요. 처리 완료가 구조 인식의 완성을 뜻하지 않습니다.')
    result.update(width=w,height=h,aspectRatio=w/h)
    return result


if __name__ == '__main__':
    try:
        mode,path,out=sys.argv[1:4];path=Path(path);out=Path(out)
        result=recognize(path) if mode=='analyze' else render(path,out,int(sys.argv[4]),int(sys.argv[5]))
        print(json.dumps(result,ensure_ascii=True,allow_nan=False))
    except Exception:
        # Never put uploaded text, filenames, parser internals or document bytes into server logs.
        print(json.dumps({'error':'파일을 해석하지 못했습니다. 손상·암호화·크기·페이지와 파일 형식을 확인하세요.'},ensure_ascii=True))
        sys.exit(2)
