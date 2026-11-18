using IebleWms.Api.Models;
using IebleWms.Api.Shipping;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class ShipmentRouteGeometryTests
{
    static WarehousePlanObject Shape(string type, double x, double y, double w, double h, Guid? rack = null)
        => new() { Type = type, X = x, Y = y, Width = w, Height = h, RackId = rack };

    // Geometry only: no production identifiers, database access, or stored-plan changes.
    static (List<WarehousePlanObject> Plan, Guid[] Racks) Plan(bool connectEntrance, bool connectRackFaces)
    {
        var ids = Enumerable.Range(0, 6).Select(_ => Guid.NewGuid()).ToArray();
        var central = Shape("aisle", .5, .5, .86, connectRackFaces ? .24 : .1);
        central.Label = "중앙 통로";
        var plan = new List<WarehousePlanObject>
        {
            Shape("door", .5, .95, .12, .025), Shape("aisle", .5, .92, .12, .1), central,
            Shape("zone", .5, .28, .84, .32), Shape("zone", .5, .72, .84, .32),
            Shape("wall", .5, .05, .94, .016), Shape("wall", .04, .5, .01, .9),
            Shape("wall", .96, .5, .01, .9), Shape("wall", .24, .95, .4, .016),
            Shape("wall", .76, .95, .4, .016)
        };
        for (var i = 0; i < 6; i++)
            plan.Add(Shape("rack", new[] { .22, .5, .78 }[i % 3], i < 3 ? .28 : .72, .18, .2, ids[i]));
        if (connectEntrance)
        {
            // Turn left below R-05, then use the gap between R-04 and R-05.
            plan.Add(Shape("aisle", .44, .9, .24, .06));
            plan.Add(Shape("aisle", .36, .7, .08, .44));
        }
        return (plan, ids);
    }

    [Fact] public void AllSixRacksRemainReachableWithoutAnyAisles()
    {
        var (plan, ids) = Plan(false, false);
        plan.RemoveAll(o => o.Type == "aisle");
        var result = ShipmentRouteOrder.Calculate(plan, 1.6, ids, []);
        Assert.Equal("connected", result.Status);
        Assert.Equal(6, result.Distances.Count);
    }

    [Fact] public void SavedGeometryAutomaticallyUsesFreeFloor()
    {
        var (plan, ids) = Plan(false, false);
        var result = ShipmentRouteOrder.Calculate(plan, 1.6, ids, []);
        Assert.Equal("connected", result.Status);
        Assert.Empty(result.DisconnectedAisles);
        Assert.Equal(6, result.Distances.Count);
        Assert.Empty(result.UnreachableRackIds);
    }

    [Fact] public void RackFaceGapsAreWalkableFloor()
    {
        var (plan, ids) = Plan(true, false);
        var result = ShipmentRouteOrder.Calculate(plan, 1.6, ids, []);
        Assert.Empty(result.DisconnectedAisles);
        Assert.Equal(6, result.Distances.Count);
        Assert.Empty(result.UnreachableRackIds);
    }

    [Fact] public void DetourAndContinuousRackFaceAisleReachAllSixRacks()
    {
        var (plan, ids) = Plan(true, true);
        var result = ShipmentRouteOrder.Calculate(plan, 1.6, ids, []);
        Assert.Equal("connected", result.Status);
        Assert.Equal(6, result.Distances.Count);
        Assert.Empty(result.DisconnectedAisles);
        Assert.Empty(result.UnreachableRackIds);
        Assert.All(result.Distances.Values, distance => Assert.True(double.IsFinite(distance)));
    }

    [Fact] public void VisualAisleThroughRackDoesNotPreventFreeFloorDetour()
    {
        var (plan, ids) = Plan(false, true);
        plan.Add(Shape("aisle", .5, .7, .12, .44));
        var result = ShipmentRouteOrder.Calculate(plan, 1.6, ids, []);
        Assert.Empty(result.DisconnectedAisles);
        Assert.Equal(6, result.Distances.Count);
        Assert.Equal("connected", result.Status);
    }
}
