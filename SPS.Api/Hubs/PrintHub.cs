using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SPS.Infrastructure.Persistence;
using Microsoft.Extensions.Caching.Memory;
using SPS.Application.DTOs;
using Microsoft.Extensions.Logging;

namespace SPS.Api.Hubs;

[Authorize]
public class PrintHub : Hub
{
    private readonly SpsDbContext _context;
    private readonly IMemoryCache _memoryCache;
    private readonly ILogger<PrintHub> _logger;
    private static readonly TimeSpan CacheEntryLifetime = TimeSpan.FromMinutes(5);

    public PrintHub(SpsDbContext context, IMemoryCache memoryCache, ILogger<PrintHub> logger)
    {
        _context = context;
        _memoryCache = memoryCache;
        _logger = logger;
    }

    public async Task RegisterConnector(Guid connectorId, string? localApiBaseUrl)
    {
        var connector = await _context.PrintConnectors.FirstOrDefaultAsync(pc => pc.Id == connectorId);
        if (connector == null)
        {
            _logger.LogWarning("Attempt to register with unknown ConnectorId: {ConnectorId}. Rejecting.", connectorId);
            throw new HubException($"Unknown PrintConnector ID: {connectorId}. Please re-pair your worker.");
        }

        // Update the PrintConnector entity with the latest LocalApiBaseUrl
        if (connector.LocalApiBaseUrl != localApiBaseUrl)
        {
            var updatedConnector = connector with { LocalApiBaseUrl = localApiBaseUrl, LastActivity = DateTime.UtcNow, IsActive = true };
            _context.Entry(connector).CurrentValues.SetValues(updatedConnector);
            await _context.SaveChangesAsync();
            _logger.LogInformation("Updated LocalApiBaseUrl for connector {ConnectorId} to {LocalApiBaseUrl}", connectorId, localApiBaseUrl);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, connectorId.ToString());
        _memoryCache.Set($"ConnectorConnection:{connectorId}", Context.ConnectionId, CacheEntryLifetime);
        _logger.LogInformation("Connector {ConnectorId} registered with connection ID {ConnectionId}", connectorId, Context.ConnectionId);
    }

    public async Task ReportPrinters(ReportPrintersRequest request)
    {
        if (request == null || request.PrintConnectorId == Guid.Empty)
        {
            _logger.LogWarning("Received invalid printer report from connector. Request or PrintConnectorId is empty.");
            throw new HubException("Invalid printer report data. PrintConnectorId cannot be empty.");
        }

        var connector = await _context.PrintConnectors.FirstOrDefaultAsync(pc => pc.Id == request.PrintConnectorId);
        if (connector == null)
        {
            _logger.LogWarning("Received printer report from unknown ConnectorId: {ConnectorId}. Rejecting.", request.PrintConnectorId);
            throw new HubException($"Unknown PrintConnector ID: {request.PrintConnectorId}. Please re-pair your worker.");
        }

        _logger.LogInformation("Received printer report from connector {ConnectorId} with {PrinterCount} printers.", 
                               request.PrintConnectorId, 
                               request.AvailablePrinters.Count);

        _memoryCache.Set($"Printers:{request.PrintConnectorId}", request.AvailablePrinters, CacheEntryLifetime);
    }

    public async Task UpdateJobStatus(Guid jobId, string status)
    {
        var job = await _context.PrintJobs.FirstOrDefaultAsync(j => j.Id == jobId);
        if (job != null)
        {
            // Create a new instance of PrintJob with the updated status
            var updatedJob = job with { Status = status };

            // Apply the changes from the new instance to the tracked instance
            _context.Entry(job).CurrentValues.SetValues(updatedJob);

            await _context.SaveChangesAsync();
            _logger.LogInformation("Updated job {JobId} status to {Status}", jobId, status);
        }
    }
}
