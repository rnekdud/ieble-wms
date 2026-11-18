using IebleWms.Api.Models;
using IebleWms.Api.Shipping;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed class ShipmentFreeFloorTests
{
    static WarehousePlanObject S(string type,double x,double y,double w,double h,Guid? id=null,double rotation=0,string shape="rectangle")
        =>new(){Type=type,X=x,Y=y,Width=w,Height=h,RackId=id,Rotation=rotation,Shape=shape};

    [Theory][InlineData("wall")][InlineData("rack")][InlineData("shape")]
    public void SolidBarrierCannotBeCrossedEvenWhenAnAisleOverlapsIt(string type)
    {
        var left=Guid.NewGuid();var right=Guid.NewGuid();
        WarehousePlanObject[] plan=[S("door",.1,.5,.005,.005),S("rack",.25,.5,.1,.1,left),S("rack",.75,.5,.1,.1,right),S(type,.5,.5,.001,1),S("aisle",.5,.5,1,.1)];
        var r=ShipmentRouteOrder.Calculate(plan,1,[left,right],[]);
        Assert.Contains(left,r.Distances.Keys);Assert.DoesNotContain(right,r.Distances.Keys);
        Assert.Equal("partial",r.Status);Assert.Empty(r.DisconnectedAisles);
    }

    [Fact] public void RackInsideClosedRoomIsNotReachable()
    {
        var id=Guid.NewGuid();WarehousePlanObject[] plan=[S("door",.1,.5,.05,.1),S("rack",.7,.5,.1,.1,id),
            S("wall",.55,.5,.01,.4),S("wall",.85,.5,.01,.4),S("wall",.7,.3,.31,.01),S("wall",.7,.7,.31,.01)];
        var r=ShipmentRouteOrder.Calculate(plan,1,[id],[]);
        Assert.Empty(r.Distances);Assert.Contains(id,r.UnreachableRackIds);
    }

    [Fact] public void DoorDoesNotPermitAnOutsideDetourAroundEnclosingWalls()
    {
        var inside=Guid.NewGuid();var outside=Guid.NewGuid();
        WarehousePlanObject[] plan=[S("wall",.5,.15,.7,.01),S("wall",.5,.85,.7,.01),S("wall",.15,.5,.01,.7),S("wall",.85,.5,.01,.7),
            S("door",.5,.85,.1,.03),S("rack",.5,.6,.1,.1,inside),S("rack",.95,.5,.05,.1,outside)];
        var r=ShipmentRouteOrder.Calculate(plan,1,[inside,outside],[]);
        Assert.Contains(inside,r.Distances.Keys);Assert.DoesNotContain(outside,r.Distances.Keys);
    }

    [Fact] public void RotatedRacksAndColumnsRequireALongerDetour()
    {
        var id=Guid.NewGuid();var plan=new List<WarehousePlanObject>{S("door",.1,.5,.02,.05),S("rack",.9,.5,.08,.08,id,20)};
        var direct=ShipmentRouteOrder.Calculate(plan,1,[id],[]).Distances[id];
        plan.Add(S("shape",.5,.5,.1,.5,null,25));
        var detour=ShipmentRouteOrder.Calculate(plan,1,[id],[]).Distances[id];
        Assert.True(detour>direct+.05);
    }

    [Fact] public void EllipticalColumnUsesItsActualOutline()
    {
        var id=Guid.NewGuid();var column=S("shape",.5,.5,.35,.7,null,0,"ellipse");
        var plan=new List<WarehousePlanObject>{S("door",.1,.5,.02,.05),S("rack",.9,.5,.08,.08,id),column};
        var ellipse=ShipmentRouteOrder.Calculate(plan,1,[id],[]).Distances[id];
        column.Shape="rectangle";
        var rectangle=ShipmentRouteOrder.Calculate(plan,1,[id],[]).Distances[id];
        Assert.True(ellipse<rectangle);Assert.True(ellipse>.8);
    }

    [Fact] public void EntranceInsideOccupiedRackCannotStartARoute()
    {
        var id=Guid.NewGuid();var r=ShipmentRouteOrder.Calculate([S("door",.5,.5,.01,.01),S("rack",.5,.5,.2,.2,id)],1,[id],[]);
        Assert.Equal("entrance_disconnected",r.Status);Assert.Empty(r.Distances);
    }

    [Fact] public void EmptyCanvasUsesDocumentBoundaryAndZonesDoNotBlock()
    {
        var id=Guid.NewGuid();var r=ShipmentRouteOrder.Calculate([S("door",0,.5,.005,.005),S("zone",.5,.5,1,1),S("rack",.8,.5,.1,.1,id)],1,[id],[]);
        Assert.Equal("connected",r.Status);Assert.True(r.Distances[id]>.7);
    }
}
