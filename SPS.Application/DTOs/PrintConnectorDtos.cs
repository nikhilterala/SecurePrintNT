public record PairingRequest(string MachineName);

public record PairingResponse(Guid PrintConnectorId, string JwtToken);

public record ReportPrintersRequest(Guid PrintConnectorId, List<PrinterInfoDto> AvailablePrinters);

public record AvailableConnectorDto(
    Guid Id,
    string MachineName,
    List<PrinterInfoDto> Printers
);
