using Microsoft.EntityFrameworkCore;
using SPS.Core.Entities;

namespace SPS.Infrastructure.Persistence;

public class SpsDbContext : DbContext
{
    public SpsDbContext(DbContextOptions<SpsDbContext> options) : base(options) { }

    public DbSet<User> Users { get; set; }
    public DbSet<SPS.Core.Entities.File> Files { get; set; }
    public DbSet<PrintConnector> PrintConnectors { get; set; }
    public DbSet<PrintJob> PrintJobs { get; set; }
    public DbSet<AuditLog> AuditLogs { get; set; }
}
