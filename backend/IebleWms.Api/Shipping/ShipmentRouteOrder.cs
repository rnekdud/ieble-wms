using IebleWms.Api.Models;
namespace IebleWms.Api.Shipping;

// Free-floor grid bounded by the document and, when present at the entrance, enclosed walls.
// Aisles are optional visual guidance. Distances are relative plan units, never metres or an optimal tour.
public static class ShipmentRouteOrder
{
    public sealed record Result(Dictionary<Guid, double> Distances, string Notice, string Status = "unavailable")
    {
        // Kept for response compatibility; disconnected visual aisles no longer block navigation.
        public string[] DisconnectedAisles { get; init; } = [];
        public Guid[] UnreachableRackIds { get; init; } = [];
    }
    private readonly record struct Point(double X, double Y);
    private readonly record struct Access(int Node, double Offset);
    private sealed record Rect(double X, double Y, double W, double H, double Angle, bool Ellipse = false)
    {
        Point Local(Point p) { var c = Math.Cos(Angle); var s = Math.Sin(Angle); return new((p.X-X)*c+(p.Y-Y)*s, -(p.X-X)*s+(p.Y-Y)*c); }
        public bool Contains(Point p)
        {
            var q=Local(p);
            return Ellipse ? Math.Pow(q.X/(W/2),2)+Math.Pow(q.Y/(H/2),2)<=1+1e-12 : Math.Abs(q.X)<=W/2+1e-12 && Math.Abs(q.Y)<=H/2+1e-12;
        }
        public Point Closest(Point p) { var q=Local(p);var x=Math.Clamp(q.X,-W/2,W/2);var y=Math.Clamp(q.Y,-H/2,H/2);return new(X+x*Math.Cos(Angle)-y*Math.Sin(Angle),Y+x*Math.Sin(Angle)+y*Math.Cos(Angle)); }
        public (double Start,double End)? Clip(Point a, Point b)
        {
            var u=Local(a);var v=Local(b);
            if(Ellipse)
            {
                var x=u.X/(W/2);var y=u.Y/(H/2);var dx=(v.X-u.X)/(W/2);var dy=(v.Y-u.Y)/(H/2);
                var aa=dx*dx+dy*dy;var bb=2*(x*dx+y*dy);var cc=x*x+y*y-1;
                if(aa<1e-24)return cc<=0?(0,1):null;
                var discriminant=bb*bb-4*aa*cc;if(discriminant<0)return null;
                var lo=Math.Max(0,(-bb-Math.Sqrt(discriminant))/(2*aa));var hi=Math.Min(1,(-bb+Math.Sqrt(discriminant))/(2*aa));
                return lo<=hi?(lo,hi):null;
            }
            double from=0,to=1;
            foreach(var (p,d,h) in new[]{(u.X,v.X-u.X,W/2),(u.Y,v.Y-u.Y,H/2)}) {
                if(Math.Abs(d)<1e-12){if(Math.Abs(p)>h)return null;continue;}
                var t1=(-h-p)/d;var t2=(h-p)/d;from=Math.Max(from,Math.Min(t1,t2));to=Math.Min(to,Math.Max(t1,t2));if(from>to)return null;
            }
            return (from,to);
        }
    }
    public static Result Calculate(IReadOnlyList<WarehousePlanObject> objects, double aspect, IEnumerable<Guid> rackIds, IReadOnlyList<Guid> selected)
    {
        var ids=rackIds.Distinct().ToArray();
        Result Fallback(string status,string reason)=>new([],reason+" 랙 코드 순으로 표시하며 동선 자동 지정은 하지 않습니다.",status) { UnreachableRackIds=ids };
        var doors=objects.Where(x=>x.Type=="door").ToArray();
        if(doors.Length!=1)return Fallback(doors.Length==0?"missing_entrance":"ambiguous_entrance",doors.Length==0?"출입구 정보가 없습니다.":"출입구가 여러 개이며 작업 시작점이 지정되지 않았습니다.");
        if(objects.Count>1500 || !double.IsFinite(aspect) || aspect is < .1 or > 10 || objects.Any(x=>!double.IsFinite(x.X)||!double.IsFinite(x.Y)||!double.IsFinite(x.Width)||!double.IsFinite(x.Height)||!double.IsFinite(x.Rotation)||x.X<0||x.X>1||x.Y<0||x.Y>1||x.Width<=0||x.Height<=0))return Fallback("invalid_plan","도면의 크기·좌표 또는 계산 한도를 확인해 주세요.");
        Rect Make(WarehousePlanObject x)=>new(x.X*aspect,x.Y,x.Width*aspect,x.Height,x.Rotation*Math.PI/180,x.Type=="shape"&&x.Shape=="ellipse");
        var doorRects=doors.Select(Make).ToArray();
        var walls=objects.Where(x=>x.Type=="wall").Select(Make).ToArray();
        var rackObjects=objects.Where(x=>x.Type=="rack").ToArray();
        // General shapes represent occupied floor/columns; zones and text are presentation only.
        var obstacles=objects.Where(x=>x.Type is "rack" or "shape").Select(Make).ToArray();
        bool Inside(Point p)=>p.X>=0&&p.X<=aspect&&p.Y>=0&&p.Y<=1;
        bool Covered(Point a,Point b,IEnumerable<Rect> rects,double from,double to) {
            var end=from;foreach(var r in rects.Select(r=>r.Clip(a,b)).Where(x=>x.HasValue).Select(x=>x!.Value).OrderBy(x=>x.Start)) {if(r.End<end)continue;if(r.Start>end+1e-9)return false;end=Math.Max(end,r.End);if(end>=to-1e-9)return true;}return end>=to-1e-9;
        }
        bool Crosses(Rect r,Point a,Point b)=>r.Clip(a,b) is {} hit && hit.End-hit.Start>1e-9;
        bool Clear(Point a,Point b)=>Inside(a)&&Inside(b)&&!obstacles.Any(r=>Crosses(r,a,b))&&
            !walls.Any(r=>r.Clip(a,b) is {} hit && hit.End-hit.Start>1e-9 && !Covered(a,b,doorRects,hit.Start,hit.End));
        const int nx=96;var ny=Math.Clamp((int)Math.Ceiling(nx/aspect),32,128);var dx=aspect/nx;var dy=1d/ny;
        var points=Enumerable.Range(0,nx*ny).Select(i=>new Point((i%nx+.5)*dx,(i/nx+.5)*dy)).ToArray();
        IEnumerable<int> Neighbors(int i)
        {
            if(i%nx>0)yield return i-1;if(i%nx<nx-1)yield return i+1;
            if(i>=nx)yield return i-nx;if(i+nx<points.Length)yield return i+nx;
        }
        // Temporarily close the entrance while flooding the outside of enclosing walls.
        // This prevents a route leaving the warehouse through its door and going around an outer wall.
        // Without an enclosing outline at the entrance, the rectangular document is the floor boundary.
        var shell=walls.Concat(doorRects).ToArray();
        bool ShellClear(Point a,Point b)=>!shell.Any(r=>Crosses(r,a,b));
        var shellFree=points.Select(p=>!shell.Any(r=>r.Contains(p))).ToArray();
        var exterior=new bool[points.Length];var flood=new Queue<int>();
        for(var i=0;i<points.Length;i++)if(shellFree[i])
        {
            var p=points[i];
            if((i%nx==0&&ShellClear(new(0,p.Y),p))||(i%nx==nx-1&&ShellClear(new(aspect,p.Y),p))||
               (i<nx&&ShellClear(new(p.X,0),p))||(i>=points.Length-nx&&ShellClear(new(p.X,1),p)))
            {exterior[i]=true;flood.Enqueue(i);}
        }
        while(flood.TryDequeue(out var i))foreach(var j in Neighbors(i))if(!exterior[j]&&shellFree[j]&&ShellClear(points[i],points[j])){exterior[j]=true;flood.Enqueue(j);}
        var start=new Point(doors[0].X*aspect,doors[0].Y);
        var free=points.Select(p=>!obstacles.Any(r=>r.Contains(p))&&(!walls.Any(r=>r.Contains(p))||doorRects.Any(r=>r.Contains(p)))).ToArray();
        var entryCandidates=Enumerable.Range(0,points.Length).Where(i=>free[i]&&
            (Distance(points[i],doorRects[0].Closest(points[i]))<=Math.Max(dx,dy)*2)&&Clear(start,points[i])).ToArray();
        var enclosed=entryCandidates.Any(i=>shellFree[i]&&!exterior[i]);
        var valid=Enumerable.Range(0,points.Length).Select(i=>free[i]&&(!enclosed||!exterior[i]&&shellFree[i]||doorRects[0].Contains(points[i]))).ToArray();
        var sources=entryCandidates.Where(i=>valid[i]).ToArray();
        if(sources.Length==0)return Fallback("entrance_disconnected","출입구에서 이동 가능한 내부 공간을 찾을 수 없습니다.");
        var edges=Enumerable.Range(0,points.Length).Select(_=>new List<(int Id,double Length)>()).ToArray();
        for(var i=0;i<points.Length;i++)if(valid[i])foreach(var j in new[]{i%nx<nx-1?i+1:-1,i+nx<points.Length?i+nx:-1})if(j>=0&&valid[j]&&Clear(points[i],points[j])){var length=Distance(points[i],points[j]);edges[i].Add((j,length));edges[j].Add((i,length));}
        var access=new Dictionary<Guid,Access[]>();
        foreach(var id in ids) {
            var shapes=rackObjects.Where(x=>x.RackId==id).ToArray();if(shapes.Length!=1)continue;
            var r=Make(shapes[0]);access[id]=Enumerable.Range(0,points.Length).Where(i=>valid[i])
                .Select(i=>new Access(i,Distance(points[i],r.Closest(points[i]))))
                .Where(a=>a.Offset<=Math.Max(dx,dy)*1.6&&Clear(points[a.Node],r.Closest(points[a.Node]))).ToArray();
        }
        double[] Distances(IEnumerable<Access> seeds) {
            var dist=Enumerable.Repeat(double.PositiveInfinity,points.Length).ToArray();var queue=new PriorityQueue<int,double>();
            foreach(var seed in seeds){dist[seed.Node]=seed.Offset;queue.Enqueue(seed.Node,seed.Offset);}
            while(queue.TryDequeue(out var i,out var cost)){if(cost>dist[i])continue;foreach(var (j,length) in edges[i])if(cost+length<dist[j]){dist[j]=cost+length;queue.Enqueue(j,dist[j]);}}return dist;
        }
        var distance=Distances(sources.Select(i=>new Access(i,Distance(start,points[i]))));
        var pending=selected.Distinct().Where(access.ContainsKey).ToHashSet();
        while(pending.Count>0)
        {
            var next=pending.SelectMany(id=>access[id].Select(a=>new{id,access=a,cost=distance[a.Node]+a.Offset}))
                .Where(x=>double.IsFinite(x.cost)).OrderBy(x=>x.cost).ThenBy(x=>x.id).ThenBy(x=>x.access.Node).FirstOrDefault();
            if(next==null)break;pending.Remove(next.id);
            // Continue from the reached face through the same free-space node; never teleport across a rack.
            distance=Distances([next.access]);
        }
        var result=access.ToDictionary(x=>x.Key,x=>x.Value.Select(a=>distance[a.Node]+a.Offset).DefaultIfEmpty(double.PositiveInfinity).Min()).Where(x=>double.IsFinite(x.Value)).ToDictionary();
        var unreachable=ids.Except(result.Keys).ToArray();
        var missingShapes=unreachable.Where(id=>rackObjects.Count(x=>x.RackId==id)!=1).ToArray();
        var rackNames=unreachable.Select(id=>rackObjects.FirstOrDefault(x=>x.RackId==id)?.Label??"도면 미연결 랙").ToArray();
        var notice=unreachable.Length>0?string.Join(", ",rackNames)+"은 이동 가능한 경로가 없어 동선 추천에서 제외되었습니다.":"";
        if(missingShapes.Length>0)notice+=" 일부 랙의 도면 연결 객체가 없거나 중복되어 있습니다.";
        if(result.Count==0)return Fallback(missingShapes.Length>0?"rack_geometry_missing":"racks_unreachable",notice.Length>0?notice:"동선을 계산할 랙이 없습니다.");
        return new(result,"출입구와 내부 빈 공간을 기준으로 선택 랙을 경유하는 근사 동선입니다. 실제 거리와 최적 경로는 보장하지 않습니다."+(notice.Length>0?" "+notice:""),unreachable.Length>0?"partial":"connected") { UnreachableRackIds=unreachable };
    }
    private static double Distance(Point a,Point b)=>Math.Sqrt((a.X-b.X)*(a.X-b.X)+(a.Y-b.Y)*(a.Y-b.Y));
}
