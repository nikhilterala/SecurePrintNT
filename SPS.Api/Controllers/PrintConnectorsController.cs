using Microsoft.AspNetCore.Mvc;
using SPS.Application.DTOs;
using SPS.Core.Entities;
using SPS.Infrastructure.Persistence;
using SPS.Infrastructure.Services;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace SPS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PrintConnectorsController : ControllerBase
{
    private readonly SpsDbContext _context;
    private readonly JwtTokenGenerator _jwtTokenGenerator;
    private readonly IMemoryCache _memoryCache;
    private readonly ILogger<PrintConnectorsController> _logger;

    public PrintConnectorsController(SpsDbContext context, JwtTokenGenerator jwtTokenGenerator, IMemoryCache memoryCache, ILogger<PrintConnectorsController> logger)
    {
        _context = context;
        _jwtTokenGenerator = jwtTokenGenerator;
        _memoryCache = memoryCache;
        _logger = logger;
    }

    [HttpPost("pair")]
    public async Task<IActionResult> Pair([FromBody] PairingRequest request)
    {
        _logger.LogInformation("Pair endpoint invoked with MachineName: {MachineName}", request.MachineName);

        var ownerUserIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (ownerUserIdClaim == null || !Guid.TryParse(ownerUserIdClaim.Value, out var ownerUserId))
        {
            _logger.LogWarning("Pairing failed: Owner not authenticated or user ID invalid.");
            return Unauthorized("Owner not authenticated or user ID invalid.");
        }

        // Check if a connector with this MachineName already exists for this user
        var existingConnector = await _context.PrintConnectors
            .FirstOrDefaultAsync(pc => pc.OwnerUserId == ownerUserId && pc.MachineName == request.MachineName);

        PrintConnector printConnector;

        if (existingConnector != null)
        {
            // Update existing connector's LastActivity and re-generate token
            existingConnector = existingConnector with { LastActivity = DateTime.UtcNow, IsActive = true };
            // No explicit _context.Update needed for tracked entity when using 'with' on record if its reference changes
            // Ensure the DbContext tracks the *updated* instance if the 'with' expression creates a new reference
            // Or, more reliably, modify the existing tracked entity directly.
            _context.Entry(existingConnector).CurrentValues.SetValues(existingConnector); // Re-assign values from the new record instance to the tracked entry.
            printConnector = existingConnector; // Use the updated entity for token generation
            _logger.LogInformation("Updating existing connector {ConnectorId} with MachineName: {MachineName}", printConnector.Id, printConnector.MachineName);
        }
        else
        {
            // Create a new connector
            printConnector = new PrintConnector(Guid.NewGuid(), ownerUserId, request.MachineName, DateTime.UtcNow, DateTime.UtcNow, true);
            _context.PrintConnectors.Add(printConnector);
            _logger.LogInformation("Creating new connector {ConnectorId} with MachineName: {MachineName}", printConnector.Id, printConnector.MachineName);
        }

        try
        {
            await _context.SaveChangesAsync();
            _logger.LogInformation("PrintConnector {ConnectorId} saved/updated in DB successfully.", printConnector.Id);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Error saving PrintConnector {ConnectorId} to DB.", printConnector.Id);
            return StatusCode(500, "Error saving print connector to database.");
        }

        // Generate a new JWT token for the print connector
        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, ownerUserId.ToString()),
            new Claim("PrintConnectorId", printConnector.Id.ToString()),
            new Claim(ClaimTypes.Role, "PrintConnector")
        };

        var connectorToken = _jwtTokenGenerator.GenerateToken(claims);

        _logger.LogInformation("Pairing successful for connector {ConnectorId}.", printConnector.Id);
        return Ok(new PairingResponse(printConnector.Id, connectorToken));
    }

    [HttpPost("validate")]
    [AllowAnonymous] // Allow anonymous as the token itself is being validated here
    public async Task<IActionResult> Validate([FromBody] ValidateConnectorRequest request)
    {
        _logger.LogInformation("Validate endpoint invoked for ConnectorId: {ConnectorId}", request.ConnectorId);
        var authorizationHeader = Request.Headers.Authorization.ToString();

        if (string.IsNullOrEmpty(authorizationHeader) || !authorizationHeader.StartsWith("Bearer "))
        {
            _logger.LogWarning("Validate failed for {ConnectorId}: Missing or invalid Authorization header.", request.ConnectorId);
            return Ok(new ValidateConnectorResponse(false));
        }

        var token = authorizationHeader.Substring("Bearer ".Length).Trim();

        var principal = _jwtTokenGenerator.GetPrincipalFromToken(token);

        if (principal == null)
        {
            _logger.LogWarning("Validate failed for {ConnectorId}: Invalid or expired JWT token.", request.ConnectorId);
            return Ok(new ValidateConnectorResponse(false));
        }

        var ownerUserIdClaim = principal.FindFirst(ClaimTypes.NameIdentifier);
        var connectorIdClaim = principal.FindFirst("PrintConnectorId"); // Assuming PrintConnectorId claim is set in JWT

        if (ownerUserIdClaim == null || !Guid.TryParse(ownerUserIdClaim.Value, out var ownerUserId) ||
            connectorIdClaim == null || !Guid.TryParse(connectorIdClaim.Value, out var tokenConnectorId))
        {
            _logger.LogWarning("Validate failed for {ConnectorId}: Missing or invalid claims in JWT.", request.ConnectorId);
            return Ok(new ValidateConnectorResponse(false));
        }

        if (tokenConnectorId != request.ConnectorId)
        {
            _logger.LogWarning("Validate failed for {ConnectorId}: Token connector ID mismatch. Token ID: {TokenConnectorId}", request.ConnectorId, tokenConnectorId);
            return Ok(new ValidateConnectorResponse(false));
        }

        var printConnector = await _context.PrintConnectors
            .FirstOrDefaultAsync(pc => pc.Id == request.ConnectorId && pc.OwnerUserId == ownerUserId);

        if (printConnector == null)
        {
            _logger.LogWarning("Validate failed for {ConnectorId}: Connector not found in database or owner mismatch.", request.ConnectorId);
            return Ok(new ValidateConnectorResponse(false));
        }

        _logger.LogInformation("Validate successful for ConnectorId: {ConnectorId}", request.ConnectorId);
        return Ok(new ValidateConnectorResponse(true));
    }

    [HttpGet("{connectorId}/printers")]
    public IActionResult GetConnectorPrinters(Guid connectorId)
    {
        _logger.LogInformation("GetConnectorPrinters invoked for connector {ConnectorId}", connectorId);
        if (_memoryCache.TryGetValue($"Printers:{connectorId}", out List<PrinterInfoDto>? printers))
        {
            if (printers != null)
            {
                _logger.LogInformation("Found {PrinterCount} printers in cache for connector {ConnectorId}.", printers.Count, connectorId);
                return Ok(printers);
            }
        }
        _logger.LogWarning("No printers found in cache for connector ID {ConnectorId}.", connectorId);
        return NotFound($"No printers found for connector ID {connectorId}.");
    }

    [HttpGet("available-connectors")]
    public async Task<IActionResult> GetAvailableConnectors()
    {
        _logger.LogInformation("GetAvailableConnectors endpoint invoked.");
        var activeConnectors = new List<AvailableConnectorDto>();

        var allConnectors = await _context.PrintConnectors.ToListAsync();
        _logger.LogInformation("Found {ConnectorCount} print connectors in DB for GetAvailableConnectors.", allConnectors.Count);

        foreach (var connector in allConnectors)
        {
            if (_memoryCache.TryGetValue($"Printers:{connector.Id}", out List<PrinterInfoDto>? printers))
            {
                if (printers != null && printers.Any())
                {
                    activeConnectors.Add(new AvailableConnectorDto(connector.Id, connector.MachineName, printers));
                }
                else
                {
                    _logger.LogWarning("No printers or empty list found in cache for connector {ConnectorId} in GetAvailableConnectors.", connector.Id);
                }
            }
            else
            {
                _logger.LogWarning("Cache entry not found for connector {ConnectorId} in GetAvailableConnectors.", connector.Id);
            }
        }

        if (!activeConnectors.Any())
        {
            _logger.LogInformation("No active print connectors found to return from GetAvailableConnectors.");
            return NotFound("No active print connectors found.");
        }

        _logger.LogInformation("Returning {ActiveConnectorCount} active print connectors from GetAvailableConnectors.", activeConnectors.Count);
        return Ok(activeConnectors);
    }
}
