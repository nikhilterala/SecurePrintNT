using Microsoft.Extensions.Logging;
using SPS.Application.Services;
using SPS.Core.Entities;
using SPS.Infrastructure.Persistence;
using System;
using System.Threading.Tasks;

namespace SPS.Infrastructure.Services
{
    public class AuditService : IAuditService
    {
        private readonly SpsDbContext _context;
        private readonly ILogger<AuditService> _logger;

        public AuditService(SpsDbContext context, ILogger<AuditService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task LogPrintJobAccessAsync(
            string printJobToken,
            string clientIpAddress,
            string userAgent,
            string status,
            string? details = null)
        {
            var auditLog = new AuditLog
            {
                Id = Guid.NewGuid(),
                Timestamp = DateTime.UtcNow,
                EventType = "PrintJobAccess",
                PrintJobToken = printJobToken,
                ClientIpAddress = clientIpAddress,
                UserAgent = userAgent,
                Status = status,
                Details = details
            };

            _context.AuditLogs.Add(auditLog);
            await _context.SaveChangesAsync();
            _logger.LogInformation("AuditLog: Print job access logged for token {PrintJobToken} with status {Status}", printJobToken, status);
        }

        public async Task LogFileDeletionAsync(Guid fileId, Guid userId, string originalFileName)
        {
            var auditLog = new AuditLog
            {
                Id = Guid.NewGuid(),
                Timestamp = DateTime.UtcNow,
                EventType = "FileDeletion",
                Details = $"File {{originalFileName}} (ID: {{fileId}}) deleted by user {{userId}}."
            };

            _context.AuditLogs.Add(auditLog);
            await _context.SaveChangesAsync();
            _logger.LogInformation("AuditLog: File deletion logged for file {FileId} by user {UserId}", fileId, userId);
        }

        public async Task LogPrintJobDeletionAsync(Guid printJobId, Guid userId, Guid fileId, string secureLinkToken)
        {
            var auditLog = new AuditLog
            {
                Id = Guid.NewGuid(),
                Timestamp = DateTime.UtcNow,
                EventType = "PrintJobDeletion",
                PrintJobToken = secureLinkToken,
                Details = $"Print job {{printJobId}} for file {{fileId}} deleted by user {{userId}}."
            };

            _context.AuditLogs.Add(auditLog);
            await _context.SaveChangesAsync();
            _logger.LogInformation("AuditLog: Print job deletion logged for job {PrintJobId} for file {FileId} by user {UserId}", printJobId, fileId, userId);
        }
    }
}
