using Microsoft.AspNetCore.Http;

namespace SPS.Application.DTOs;

public record FileUploadRequest(IFormFile File, bool AllowDirectAccess, string? UserProvidedSecret = null);
