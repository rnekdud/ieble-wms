using Npgsql;
namespace IebleWms.Api.Billing;
public interface ILocalDevelopmentEnvironment { bool IsLocal { get; } }
public sealed class LocalDevelopmentEnvironment(IHostEnvironment environment,IConfiguration configuration):ILocalDevelopmentEnvironment
{
    public bool IsLocal
    {
        get
        {
            if(!environment.IsDevelopment())return false;
            try
            {
                var c=new NpgsqlConnectionStringBuilder(configuration.GetConnectionString("DefaultConnection"));
                return c.Host is "localhost" or "127.0.0.1" && c.Port==5435 && c.Database=="ieble_wms_dev";
            }
            catch{return false;}
        }
    }
}
