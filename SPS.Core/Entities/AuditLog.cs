using System;

namespace SPS.Core.Entities
{
    public class AuditLog
    {
        public Guid Id { get; set; }
        public DateTime Timestamp { get; set; }
        public string EventType { get; set; } = string.Empty;
        public string PrintJobToken { get; set; } = string.Empty;
        public string ClientIpAddress { get; set; } = string.Empty;
        public string UserAgent { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string? Details { get; set; }
    }
}
