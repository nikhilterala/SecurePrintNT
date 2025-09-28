using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using System.IO;

namespace SPS.Infrastructure.Persistence
{
    public class SpsDbContextFactory : IDesignTimeDbContextFactory<SpsDbContext>
    {
        public SpsDbContext CreateDbContext(string[] args)
        {
            // Build configuration
            IConfigurationRoot configuration = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
                .Build();

            // Configure DbContextOptions
            var builder = new DbContextOptionsBuilder<SpsDbContext>();
            var connectionString = configuration.GetConnectionString("DefaultConnection");

            // For design-time, we might use a simple InMemory or a specific development connection string
            // For migrations, it's usually sufficient to provide a valid connection string format.
            // Replace with your actual database connection string if it's not in appsettings.json
            builder.UseSqlServer(connectionString ?? "Server=(localdb)\\mssqllocaldb;Database=SpsSecurePrint;Trusted_Connection=True;MultipleActiveResultSets=true");

            return new SpsDbContext(builder.Options);
        }
    }
}
