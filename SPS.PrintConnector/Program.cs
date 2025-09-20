using SPS.PrintConnector;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<Worker>(); // Register Worker as a singleton
builder.Services.AddHostedService(provider => provider.GetRequiredService<Worker>()); // Register the singleton Worker as a HostedService

// Add CORS services
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy =>
        {
            policy.WithOrigins("http://localhost:5173") // Allow your frontend URL
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials(); // Important for SignalR if used with credentials, and generally good practice for specific origins
        });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
// Use CORS middleware
app.UseCors("AllowFrontend");

// No specific pipeline configuration needed for a simple endpoint, but can add if required.

// Expose an endpoint to get the ConnectorId
app.MapGet("/api/worker-info", (Worker worker) =>
{
    // Ensure the worker has a valid ConnectorId
    if (worker.ConnectorId != Guid.Empty)
    {
        return Results.Ok(new { ConnectorId = worker.ConnectorId });
    }
    return Results.NotFound("Connector ID not available yet or worker not configured.");
});

app.Run();
