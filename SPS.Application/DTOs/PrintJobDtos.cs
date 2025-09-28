using SPS.Application.DTOs;

public record PrintJobRequest(Guid FileId, Guid? AssignedConnectorId);

public record PrintJobReceivedDto(Guid JobId, string FileSasUrl);

public record AccessPrintJobResponseDto(
    string? FileSasUrl,
    string Message,
    List<PrinterInfoDto>? AvailablePrinters = null,
    string? WorkerDownloadLink = null,
    List<AvailableConnectorDto>? AvailableConnectors = null
);

public record ValidateConnectorRequest(Guid ConnectorId);
public record ValidateConnectorResponse(bool IsValid);

public record ReprintRequest(
    Guid ConnectorId,
    string PrinterName,
    string FileSecret
);

public record AssignConnectorRequest(
    Guid JobId,
    Guid ConnectorId
);
