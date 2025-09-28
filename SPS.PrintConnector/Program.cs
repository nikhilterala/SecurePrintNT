using Microsoft.Extensions.Hosting.WindowsServices;
using SPS.PrintConnector;
using SPS.PrintConnector.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using System.IO;

var builder = WebApplication.CreateBuilder(args);

// Configure Windows Service hosting
builder.Host.UseWindowsService(options =>
{
    options.ServiceName = "SPSPrintConnector";
});

// Load production-specific config.json if in Production environment
if (builder.Environment.IsProduction())
{
    var commonAppDataPath = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
    var appConfigPath = Path.Combine(commonAppDataPath, "SPSPrintConnector", "config.json");
    builder.Configuration.AddJsonFile(appConfigPath, optional: true, reloadOnChange: true);
}

// Add services to the container.
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<IPrintService, PrintService>();
builder.Services.AddSingleton<IDeviceIdService, DeviceIdService>();
builder.Services.AddSingleton<Worker>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<Worker>());

// Add CORS services
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy =>
        {
            policy.WithOrigins("http://localhost:5173")
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
app.UseCors("AllowFrontend");

// Expose an endpoint to get the ConnectorId
app.MapGet("/api/worker-info", (Worker worker) =>
{
    if (worker.ConnectorId != Guid.Empty)
    {
        return Results.Ok(new { ConnectorId = worker.ConnectorId });
    }
    return Results.NotFound("Connector ID not available yet or worker not configured.");
});

app.Run();
