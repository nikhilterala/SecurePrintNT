namespace SPS.Application.DTOs;

public record PrintAccessRequest(string FileSecret, Guid? LocalConnectorId = null);
