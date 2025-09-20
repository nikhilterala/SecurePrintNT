using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SPS.Application.DTOs;
using SPS.Application.Services;
using SPS.Core.Entities;
using SPS.Infrastructure.Persistence;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging; // Add this using directive

namespace SPS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FilesController : ControllerBase
{
    private readonly IFileStorageService _fileStorageService;
    private readonly SpsDbContext _context;
    private readonly IConfiguration _configuration; // Inject IConfiguration
    private readonly ILogger<FilesController> _logger; // Add ILogger
    private readonly IAuditService _auditService; // Inject IAuditService

    public FilesController(IFileStorageService fileStorageService, SpsDbContext context, IConfiguration configuration, ILogger<FilesController> logger, IAuditService auditService)
    {
        _fileStorageService = fileStorageService;
        _context = context;
        _configuration = configuration; // Assign IConfiguration
        _logger = logger; // Assign ILogger
        _auditService = auditService; // Assign IAuditService
    }

    [HttpPost("upload")]
    public async Task<IActionResult> Upload([FromForm] FileUploadRequest request)
    {
        if (request.File == null || request.File.Length == 0)
        {
            return BadRequest("No file uploaded.");
        }

        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null || !Guid.TryParse(userIdClaim.Value, out var ownerUserId))
        {
            return Unauthorized("User not authenticated or user ID invalid.");
        }

        if (string.IsNullOrEmpty(request.UserProvidedSecret))
        {
            return BadRequest("File secret is required.");
        }

        // Frontend now handles length validation for user-provided secrets.
        // The backend will still implicitly handle empty/null secret hashes during verification.

        var blobPath = $"{ownerUserId}/{Guid.NewGuid()}-{request.File.FileName}";

        using (var stream = request.File.OpenReadStream())
        {
            await _fileStorageService.UploadFileAsync(stream, blobPath, request.File.ContentType);
        }

        var fileSecret = request.UserProvidedSecret;
        var secretHash = BCrypt.Net.BCrypt.HashPassword(fileSecret);

        var fileEntity = new SPS.Core.Entities.File(Guid.NewGuid(), ownerUserId, blobPath, request.File.FileName, secretHash, request.AllowDirectAccess, DateTime.UtcNow);
        _context.Files.Add(fileEntity);
        await _context.SaveChangesAsync();

        var fileDto = new FileDto(fileEntity.Id, fileEntity.OriginalFileName, fileEntity.BlobPath, fileEntity.UploadedTimestamp, fileSecret, null);
        return Ok(fileDto);
    }

    private string GenerateRandomSecret()
    {
        const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        var random = new Random();
        return new string(Enumerable.Repeat(chars, 8).Select(s => s[random.Next(s.Length)]).ToArray());
    }

    [HttpGet]
    public async Task<IActionResult> GetUserFiles()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null || !Guid.TryParse(userIdClaim.Value, out var ownerUserId))
        {
            return Unauthorized("User not authenticated or user ID invalid.");
        }

        var frontendUrl = _configuration["Frontend:Url"] ?? "https://localhost:3000";
        var userFiles = await _context.Files
            .Where(f => f.OwnerUserId == ownerUserId)
            .GroupJoin(
                _context.PrintJobs,
                file => file.Id,
                job => job.FileId,
                (file, jobs) => new { file, jobs = jobs.DefaultIfEmpty() }
            )
            .SelectMany(x => x.jobs.Select(job => new FileDto(
                x.file.Id,
                x.file.OriginalFileName,
                x.file.BlobPath,
                x.file.UploadedTimestamp, // UploadedTimestamp is now the 4th argument
                null, // Secret is now the 5th argument
                job != null ? frontendUrl + "/print/" + job.SecureLinkToken : null // SecureLink is now the 6th argument
            )))
            .ToListAsync();

        return Ok(userFiles);
    }

    [HttpPost("reset-secret/{fileId}")]
    public async Task<IActionResult> ResetFileSecret(Guid fileId, [FromBody] ResetSecretRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null || !Guid.TryParse(userIdClaim.Value, out var ownerUserId))
        {
            return Unauthorized("User not authenticated or user ID invalid.");
        }

        var file = await _context.Files.FirstOrDefaultAsync(f => f.Id == fileId && f.OwnerUserId == ownerUserId);
        if (file == null)
        {
            return NotFound("File not found or not owned by user.");
        }

        if (string.IsNullOrEmpty(request.NewSecret))
        {
            return BadRequest("New secret is required.");
        }

        var newFileSecret = request.NewSecret;
        var newSecretHash = BCrypt.Net.BCrypt.HashPassword(newFileSecret);

        // Create a new file record with the updated secret hash
        var newFile = file with { SecretHash = newSecretHash };

        // Update the tracked entity with values from the new record
        _context.Entry(file).CurrentValues.SetValues(newFile);

        await _context.SaveChangesAsync();

        return Ok(new FileDto(newFile.Id, newFile.OriginalFileName, newFile.BlobPath, newFile.UploadedTimestamp, newFileSecret, null));
    }

    [HttpDelete("{fileId}")]
    public async Task<IActionResult> DeleteFile(Guid fileId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null || !Guid.TryParse(userIdClaim.Value, out var ownerUserId))
        {
            return Unauthorized("User not authenticated or user ID invalid.");
        }

        var file = await _context.Files.FirstOrDefaultAsync(f => f.Id == fileId && f.OwnerUserId == ownerUserId);
        if (file == null)
        {
            return NotFound("File not found or not owned by user.");
        }

        // Log audit event for file deletion
        await _auditService.LogFileDeletionAsync(fileId, ownerUserId, file.OriginalFileName);

        // Find and delete associated print jobs
        var associatedPrintJobs = await _context.PrintJobs.Where(pj => pj.FileId == fileId).ToListAsync();
        foreach (var job in associatedPrintJobs)
        {
            await _auditService.LogPrintJobDeletionAsync(job.Id, ownerUserId, fileId, job.SecureLinkToken); // Log each print job deletion
            _context.PrintJobs.Remove(job);
        }

        // Delete the physical file from blob storage
        await _fileStorageService.DeleteFileAsync(file.BlobPath);

        // Remove the file from the database
        _context.Files.Remove(file);
        await _context.SaveChangesAsync();

        return Ok();
    }
}
