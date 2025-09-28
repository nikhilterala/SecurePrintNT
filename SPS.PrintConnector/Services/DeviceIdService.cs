using Microsoft.Extensions.Logging;
using System;
using System.IO;

namespace SPS.PrintConnector.Services
{
    public class DeviceIdService : IDeviceIdService
    {
        private readonly ILogger<DeviceIdService> _logger;
        private readonly string _deviceIdFilePath;
        private Guid _deviceId;

        public DeviceIdService(ILogger<DeviceIdService> logger)
        {
            _logger = logger;
            var commonAppDataPath = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            var appDataDir = Path.Combine(commonAppDataPath, "SPSPrintConnector");

            if (!Directory.Exists(appDataDir))
            {
                Directory.CreateDirectory(appDataDir);
            }

            _deviceIdFilePath = Path.Combine(appDataDir, "deviceid.txt");
            _deviceId = LoadOrCreateDeviceId();
        }

        public Guid GetDeviceId()
        {
            return _deviceId;
        }

        private Guid LoadOrCreateDeviceId()
        {
            if (File.Exists(_deviceIdFilePath))
            {
                try
                {
                    var idString = File.ReadAllText(_deviceIdFilePath).Trim();
                    _deviceId = Guid.Parse(idString);
                    _logger.LogInformation("Loaded existing device ID: {DeviceId}", _deviceId);
                    return _deviceId;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error loading device ID from {FilePath}. Generating new ID.", _deviceIdFilePath);
                }
            }

            _deviceId = Guid.NewGuid();
            try
            {
                File.WriteAllText(_deviceIdFilePath, _deviceId.ToString());
                _logger.LogInformation("Generated and saved new device ID: {DeviceId}", _deviceId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving new device ID to {FilePath}. The service will continue with a generated ID, but it may not be persistent.", _deviceIdFilePath);
            }
            return _deviceId;
        }
    }
}
