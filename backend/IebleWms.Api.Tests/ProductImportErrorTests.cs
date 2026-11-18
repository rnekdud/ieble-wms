using System.Net;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class ProductTests
{
    [Fact] public async Task ImportRequestAndLimitFailuresKeepStructuredErrorsOnNonSuccessStatus()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var file=await ImportFile((8,ImportRow("오류 계약","CODE","LABEL")));
        var response=await Post(c,t.Root+"/import-preview",new{requestId=Guid.Empty,fileBase64=file},HttpStatusCode.BadRequest);
        Assert.False(response.GetProperty("committed").GetBoolean());Assert.Equal(0,response.GetProperty("errors")[0].GetProperty("row").GetInt32());Assert.Equal("파일",response.GetProperty("errors")[0].GetProperty("column").GetString());
        var tooMany=await ImportFile(Enumerable.Range(2,501).Select(row=>(row,ImportRow("상품","CODE-"+row,"LABEL-"+row))).ToArray());
        response=await Post(c,t.Root+"/import-preview",new{requestId=Guid.NewGuid(),fileBase64=tooMany},HttpStatusCode.RequestEntityTooLarge);
        Assert.Single(response.GetProperty("errors").EnumerateArray());Assert.Contains("500",response.GetProperty("errors")[0].GetProperty("message").GetString());
        var bad=ImportRow("","MISSING-NAME","");bad[8]="문자";
        response=await Post(c,t.Root+"/import-preview",new{requestId=Guid.NewGuid(),fileBase64=await ImportFile((8,bad))},HttpStatusCode.OK);
        Assert.All(response.GetProperty("errors").EnumerateArray(),e=>{Assert.Equal(8,e.GetProperty("row").GetInt32());Assert.Equal("MISSING-NAME",e.GetProperty("productCode").GetString());});
    }
}
