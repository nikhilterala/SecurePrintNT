using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SPS.Core.Entities
{
    public record PrintConnector(
        Guid Id,
        Guid OwnerUserId,
        string MachineName,
        string? Description, // Added for consistency with DTOs
        string? LocalApiBaseUrl, // New property
        DateTime PairedTimestamp,
        DateTime LastActivity,
        bool IsActive
    );
}
