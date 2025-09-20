using System.Threading.Tasks;

namespace SPS.Application.Services
{
    public interface IAuditService
    {
        Task LogPrintJobAccessAsync(
            string printJobToken,
            string clientIpAddress,
            string userAgent,
            string status,
            string? details = null);

        Task LogFileDeletionAsync(Guid fileId, Guid userId, string originalFileName);
        Task LogPrintJobDeletionAsync(Guid printJobId, Guid userId, Guid fileId, string secureLinkToken);
    }
}
