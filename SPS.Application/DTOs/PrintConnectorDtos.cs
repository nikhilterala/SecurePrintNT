namespace SPS.Application.DTOs;

public record PairingRequest(string MachineName);

public record PairingResponse(Guid PrintConnectorId, string JwtToken);

public record PrinterInfoDto(string Name, bool IsDefault);

public record ReportPrintersRequest(Guid PrintConnectorId, List<PrinterInfoDto> AvailablePrinters);

public record RegisterPrintConnectorRequest(
    string Name,
    string? Description,
    string PairingToken,
    string? LocalApiBaseUrl);

public record PrintConnectorDto(
    Guid Id,
    string MachineName,
    string? Description,
    string LocalApiBaseUrl,
    DateTime LastSeen,
    bool IsOnline,
    List<PrinterInfoDto> Printers
);

public record AvailableConnectorDto(
    Guid Id,
    string MachineName,
    string? LocalApiBaseUrl,
    List<PrinterInfoDto> Printers
);
