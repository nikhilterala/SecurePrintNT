using System;

namespace SPS.PrintConnector.Services
{
    public interface IDeviceIdService
    {
        Guid GetDeviceId();
    }
}
