using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SPS.Application.DTOs;
using SPS.Application.Services;
using SPS.Core.Entities;
using SPS.Api.Hubs;
using SPS.Infrastructure.Persistence;
using SPS.Infrastructure.Services;
using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace SPS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class JobsController : ControllerBase
{
    private readonly SpsDbContext _context;
    private readonly IFileStorageService _fileStorageService;
    private readonly IHubContext<PrintHub> _hubContext;
    private readonly IConfiguration _configuration;
    private readonly IAuditService _auditService;
    private readonly IMemoryCache _memoryCache;
    private readonly ILogger<JobsController> _logger;

    public JobsController(SpsDbContext context, IFileStorageService fileStorageService, IHubContext<PrintHub> hubContext, IConfiguration configuration, IAuditService auditService, IMemoryCache memoryCache, ILogger<JobsController> logger)
    {
        _context = context;
        _fileStorageService = fileStorageService;
        _hubContext = hubContext;
        _configuration = configuration;
        _auditService = auditService;
        _memoryCache = memoryCache;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> CreateJob([FromBody] PrintJobRequest request)
    {
        var senderUserIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (senderUserIdClaim == null || !Guid.TryParse(senderUserIdClaim.Value, out var senderUserId))
        {
            return Unauthorized("Sender not authenticated or user ID invalid.");
        }

        var file = await _context.Files.FindAsync(request.FileId);
        if (file == null || file.OwnerUserId != senderUserId)
        {
            return NotFound("File not found or not owned by user.");
        }

        var secureLinkToken = Guid.NewGuid().ToString();
        var printJob = new PrintJob(
            Guid.NewGuid(),
            request.FileId,
            senderUserId,
            "Sent",
            secureLinkToken,
            DateTime.UtcNow.AddHours(24) // Job expires in 24 hours
        );

        _context.PrintJobs.Add(printJob);
        await _context.SaveChangesAsync();

        var frontendUrl = _configuration["Frontend:Url"] ?? "https://localhost:3000";
        var secureLink = $"{frontendUrl}/print/{secureLinkToken}";

        return Ok(new { SecureLink = secureLink });
    }

    [AllowAnonymous]
    [HttpPost("access-print-job/{token}")]
    public async Task<IActionResult> AccessPrintJob(string token, [FromBody] PrintAccessRequest request)
    {
        var clientIpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
        var userAgent = HttpContext.Request.Headers["User-Agent"].ToString() ?? "Unknown";

        await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Attempt");

        var job = await _context.PrintJobs.FirstOrDefaultAsync(j => j.SecureLinkToken == token);
        if (job == null)
        {
            await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Failure", "Print job not found or expired.");
            return NotFound("Print job not found or expired.");
        }

        // Ensure the file exists and belongs to the job sender
        var file = await _context.Files.FirstOrDefaultAsync(f => f.Id == job.FileId && f.OwnerUserId == job.SenderUserId);
        if (file == null)
        {
            await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Failure", "Associated file not found.");
            return NotFound("Associated file not found.");
        }

        // Verify file secret
        if (string.IsNullOrEmpty(file.SecretHash) || !BCrypt.Net.BCrypt.Verify(request.FileSecret, file.SecretHash))
        {
            await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Failure", "Invalid file secret.");
            return Unauthorized("Invalid file secret.");
        }

        // Generate a short-lived SAS token for the file
        var sasUrl = _fileStorageService.GenerateSasUrl(file.BlobPath, DateTimeOffset.UtcNow.AddMinutes(5));

        // Fetch available connectors for the PrintAccessPage to display.
        // If a LocalConnectorId is provided, strictly filter to only that connector.
        // If no LocalConnectorId is provided (or is empty), then no connectors are assumed to be relevant.
        var availableConnectors = new List<AvailableConnectorDto>();
        List<PrintConnector> relevantConnectors = new List<PrintConnector>(); // Initialize as empty list

        if (request.LocalConnectorId.HasValue && request.LocalConnectorId.Value != Guid.Empty)
        {
            _logger.LogInformation("Frontend provided LocalConnectorId: {LocalConnectorId}. Attempting to find this specific connector.", request.LocalConnectorId.Value);
            var localConnector = await _context.PrintConnectors
                                                .FirstOrDefaultAsync(pc => pc.Id == request.LocalConnectorId.Value);
            if (localConnector != null)
            {
                relevantConnectors.Add(localConnector);
                _logger.LogInformation("Found matching local connector: {LocalConnectorId}.", request.LocalConnectorId.Value);
            }
            else
            {
                _logger.LogInformation("LocalConnectorId {LocalConnectorId} provided, but no matching connector found in DB.", request.LocalConnectorId.Value);
            }
        }
        else
        {
            _logger.LogInformation("No LocalConnectorId provided from frontend. No specific local workers will be considered for this request.");
        }

        // Now process only the relevantConnectors (which might be empty or contain one local connector).
        _logger.LogInformation("Processing {RelevantConnectorCount} relevant print connectors.", relevantConnectors.Count);

        foreach (var connector in relevantConnectors)
        {
            _logger.LogInformation("Checking cache for printers from connector {ConnectorId}.", connector.Id);
            if (_memoryCache.TryGetValue($"Printers:{connector.Id}", out List<PrinterInfoDto>? printers))
            {
                var currentPrinters = (printers ?? new List<PrinterInfoDto>());
                availableConnectors.Add(new AvailableConnectorDto(connector.Id, connector.MachineName, currentPrinters));
                _logger.LogInformation("Connector {0} reported {1} printers. Adding to available connectors.", connector.Id, currentPrinters.Count);
            }
            else
            {
                _logger.LogInformation("Cache entry not found for connector {ConnectorId}. Not adding to available connectors (implies worker not active/reporting).", connector.Id);
            }
        }
        _logger.LogInformation("Final count of available connectors to return: {AvailableConnectorCount}.", availableConnectors.Count);

        bool anyWorkersOnline = availableConnectors.Any();
        bool anyPrintersFromOnlineWorkers = availableConnectors.Any(ac => ac.Printers.Any());
        string message;
        string? workerDownloadLinkToReturn = null;

        if (file.AllowDirectAccess)
        {
            if (anyWorkersOnline && anyPrintersFromOnlineWorkers)
            {
                message = "Your file is ready for viewing, downloading, or printing.";
            }
            else if (anyWorkersOnline && !anyPrintersFromOnlineWorkers)
            {
                message = "Your file is ready for viewing or downloading. No physical printers are available from the detected print connector.";
            }
            else
            {
                message = "Your file is ready for viewing or downloading. No local print connector service is detected for printing.";
                workerDownloadLinkToReturn = _configuration["Worker:DownloadLink"];
            }
            await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Success", "Direct access allowed.");
            return Ok(new AccessPrintJobResponseDto(
                FileSasUrl: sasUrl,
                Message: message,
                AvailablePrinters: null,
                AvailableConnectors: availableConnectors,
                WorkerDownloadLink: workerDownloadLinkToReturn
            ));
        }
        else // Direct access is NOT allowed
        {
            if (anyWorkersOnline && anyPrintersFromOnlineWorkers)
            {
                message = "Direct viewing or downloading is not enabled for this file. Please select a printer to proceed with printing.";
            }
            else if (anyWorkersOnline && !anyPrintersFromOnlineWorkers)
            {
                message = "Direct viewing or downloading is not enabled for this file. No physical printers are available from the detected print connector.";
            }
            else
            {
                message = "Direct viewing or downloading is not enabled for this file. No local print connector service is detected for printing. Please install a print connector to proceed.";
                workerDownloadLinkToReturn = _configuration["Worker:DownloadLink"];
            }
            await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Success", "Direct access not allowed; worker required.");
            return Ok(new AccessPrintJobResponseDto(
                FileSasUrl: null,
                Message: message,
                AvailablePrinters: null,
                AvailableConnectors: availableConnectors,
                WorkerDownloadLink: workerDownloadLinkToReturn
            ));
        }
    }

    [HttpGet("my-jobs")]
    public async Task<IActionResult> GetMyPrintJobs()
    {
        var senderUserIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (senderUserIdClaim == null || !Guid.TryParse(senderUserIdClaim.Value, out var senderUserId))
        {
            return Unauthorized("Sender not authenticated or user ID invalid.");
        }

        var myJobs = await _context.PrintJobs
            .Where(j => j.SenderUserId == senderUserId)
            .Select(j => new { j.Id, j.FileId, j.Status, j.SecureLinkToken, j.ExpiryTimestamp })
            .ToListAsync();

        return Ok(myJobs);
    }

    [AllowAnonymous]
    [HttpPost("reprint/{token}")]
    public async Task<IActionResult> ReprintJob(string token, [FromBody] ReprintRequest request)
    {
        var clientIpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
        var userAgent = HttpContext.Request.Headers["User-Agent"].ToString() ?? "Unknown";

        await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Reprint Attempt");

        var job = await _context.PrintJobs.FirstOrDefaultAsync(j => j.SecureLinkToken == token);
        if (job == null)
        {
            await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Reprint Failure", "Print job not found or expired.");
            return NotFound("Print job not found or expired.");
        }

        var file = await _context.Files.FirstOrDefaultAsync(f => f.Id == job.FileId && f.OwnerUserId == job.SenderUserId);
        if (file == null)
        {
            await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Reprint Failure", "Associated file not found.");
            return NotFound("Associated file not found.");
        }

        if (string.IsNullOrEmpty(file.SecretHash) || !BCrypt.Net.BCrypt.Verify(request.FileSecret, file.SecretHash))
        {
            await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Reprint Failure", "Invalid file secret.");
            return Unauthorized("Invalid file secret.");
        }

        // No longer check job.AssignedConnectorId as jobs are not pre-assigned to connectors
        // The request now contains the target connector and printer

        // Generate a fresh SAS URL for the reprint
        var sasUrl = _fileStorageService.GenerateSasUrl(file.BlobPath, DateTimeOffset.UtcNow.AddMinutes(5));

        // Push job to specific connector via SignalR, including the requested printer name
        await _hubContext.Clients.Group(request.ConnectorId.ToString()).SendAsync("ReceivePrintJob", job.Id, sasUrl, request.PrinterName);
        await _auditService.LogPrintJobAccessAsync(token, clientIpAddress, userAgent, "Reprint Success", $"Job {job.Id} sent to connector {request.ConnectorId} for printer {request.PrinterName}.");

        return Ok(new { Message = $"Print job sent to {request.PrinterName} on connector {request.ConnectorId}." });
    }
}
