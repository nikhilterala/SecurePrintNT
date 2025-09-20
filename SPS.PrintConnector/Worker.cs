using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR.Client;
using SPS.Application.DTOs;
using System.Drawing.Printing;
using System.Net.Http.Json;
using Newtonsoft.Json;
using PdfiumViewer;
using System.Drawing.Imaging;
using Microsoft.Extensions.Configuration;
using System.Collections.Generic;
using Microsoft.Extensions.Caching.Memory; // Add this using directive
using System.Linq; // Added for .Any()

namespace SPS.PrintConnector;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly IConfiguration _configuration;
    private readonly HttpClient _httpClient;
    private readonly IMemoryCache _memoryCache; // Add this field
    private HubConnection? _hubConnection; // Made nullable

    private Guid _connectorId;
    // Public getter for _connectorId to be accessed by Program.cs
    public Guid ConnectorId => _connectorId;

    private string? _jwtToken; // Made nullable
    private const string ConfigFilePath = "config.json";

    public Worker(ILogger<Worker> logger, IConfiguration configuration, HttpClient httpClient, IMemoryCache memoryCache) // Add IMemoryCache to constructor
    {
        _logger = logger;
        _configuration = configuration;
        _httpClient = httpClient;
        _memoryCache = memoryCache; // Assign it
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Worker running at: {time}", DateTimeOffset.Now);

        while (!stoppingToken.IsCancellationRequested)
        {
            // Phase 1: Ensure connector is configured (blocking operation)
            while (_connectorId == Guid.Empty && !stoppingToken.IsCancellationRequested)
            {
                _logger.LogInformation("Connector ID is empty. Attempting SetupConnector.");
                try
                {
                    await SetupConnector(stoppingToken);
                    // If SetupConnector succeeds, initialize the SignalR connection
                    await InitializeHubConnection(stoppingToken);
                    _logger.LogInformation("SetupConnector successful. HubConnection initialized.");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during SetupConnector. Please fix the issue and restart the worker, or try again.");
                    _connectorId = Guid.Empty; // Ensure it remains unconfigured if setup fails
                    // Allow user to see error before retrying or exiting
                    await Task.Delay(10000, stoppingToken); 
                    // Clear Console input buffer to prevent stale inputs on re-prompt
                    while (Console.In.Peek() != -1) Console.In.ReadLine();
                }
            }

            // Phase 2: Operate with SignalR if configured
            if (_hubConnection != null && _connectorId != Guid.Empty)
            {
                bool reSetupNeeded = false;
                try
                {
                    if (_hubConnection.State == HubConnectionState.Disconnected)
                    {
                        _logger.LogInformation("SignalR HubConnection is disconnected. Attempting to start...");
                        await _hubConnection.StartAsync(stoppingToken);
                        _logger.LogInformation("SignalR HubConnection started. Connection ID: {ConnectionId}", _hubConnection.ConnectionId);
                        await _hubConnection.InvokeAsync("RegisterConnector", _connectorId, stoppingToken);
                        _logger.LogInformation("Connector registered with hub.");
                    }

                    // Keep reporting printers periodically
                    while (_hubConnection.State == HubConnectionState.Connected && !stoppingToken.IsCancellationRequested)
                    {
                        await Task.Delay(30000, stoppingToken); // Report every 30 seconds
                        if (_hubConnection.State == HubConnectionState.Connected)
                        {
                            await SendAvailablePrinters();
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during SignalR operation.");

                    // Check if the exception or its inner exception is indicative of an unknown connector ID
                    var baseExceptionMessage = ex.InnerException?.Message ?? ex.Message;
                    if (baseExceptionMessage.Contains("Unknown PrintConnector ID") || baseExceptionMessage.Contains("Please re-pair your worker"))
                    {
                        _logger.LogWarning("HubException (identified by message) caught during SignalR operation. Invalidating connector config and re-pairing.");
                        await InvalidateConnectorConfig(); // This will set _connectorId to Guid.Empty, triggering re-setup
                        reSetupNeeded = true;
                    }
                    else
                    {
                        // For other transient exceptions, let automatic reconnect handle it, or just log and wait.
                        _logger.LogInformation("Non-HubException caught. Allowing automatic reconnect or retrying after a delay.");
                        await Task.Delay(5000, stoppingToken);
                    }
                }

                if (reSetupNeeded)
                {
                    continue; // Restart the outer while loop to go back to SetupConnector phase
                }
            }
            else
            {
                // This state should ideally not be reached if Phase 1 handled _connectorId == Guid.Empty correctly.
                _logger.LogWarning("Unexpected state: HubConnection is null or connector ID is empty outside of setup phase. Waiting...");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }

#pragma warning disable CS1998 // This async method lacks 'await' operators and will run synchronously
    private async Task InitializeHubConnection(CancellationToken stoppingToken)
    {
        // Dispose any existing connection before creating a new one
        if (_hubConnection != null)
        {
            _logger.LogInformation("Disposing previous SignalR HubConnection.");
            try
            {
                await _hubConnection.DisposeAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error disposing previous HubConnection.");
            }
        }

        _hubConnection = new HubConnectionBuilder()
            .WithUrl($"{_configuration["SPSApi:Url"]}/printhub", options =>
            {
                options.AccessTokenProvider = () => Task.FromResult(_jwtToken);
            })
            .WithAutomaticReconnect()
            .Build();
        await Task.CompletedTask; // Satisfy linter for synchronous HubConnection build

        await SubscribeToHubEventsAsync(_hubConnection, stoppingToken);
    }
#pragma warning restore CS1998 // This async method lacks 'await' operators and will run synchronously

#pragma warning disable CS1998 // This async method lacks 'await' operators and will run synchronously
    private async Task SubscribeToHubEventsAsync(HubConnection hubConnection, CancellationToken stoppingToken)
    {
        hubConnection.On<Guid, string, string>("ReceivePrintJob", async (jobId, fileSasUrl, printerName) =>
        {
            _logger.LogInformation("Received print job {jobId} for printer {printerName}", jobId, printerName);
            string status = "Failed";
            try
            {
                // --- New: Worker-side validation of printerName --- 
                if (!_memoryCache.TryGetValue($"Printers:{_connectorId}", out List<PrinterInfoDto>? cachedPrinters) || cachedPrinters == null || !cachedPrinters.Any(p => p.Name.Equals(printerName, StringComparison.OrdinalIgnoreCase)))
                {
                    _logger.LogError("Received print job {jobId} for unknown or unavailable printer {PrinterName} on connector {ConnectorId}. Rejecting.", jobId, printerName, _connectorId);
                    throw new InvalidOperationException($"Printer {printerName} is not available or not reported by this connector.");
                }
                // --- End New --- 

                var fileBytes = await _httpClient.GetByteArrayAsync(fileSasUrl);

                // Load from a MemoryStream to avoid file locking issues
                using (var stream = new MemoryStream(fileBytes))
                using (var document = PdfDocument.Load(stream))
                {
                    using (var printDocument = new PrintDocument())
                    {
                        printDocument.PrinterSettings.PrinterName = printerName; // Set the specific printer name
                        if (!printDocument.PrinterSettings.IsValid)
                        {
                            _logger.LogError("Printer {PrinterName} is not valid.", printerName);
                            throw new InvalidOperationException($"Printer {printerName} is not valid or not found.");
                        }

                        printDocument.PrintPage += (s, e) =>
                        {
                            // Render the first page of the PDF to the print graphics
                            using (var image = document.Render(0, e.PageBounds.Width, e.PageBounds.Height, true))
                            {
                                if (image != null)
                                {
                                    e.Graphics!.DrawImage(image, e.PageBounds);
                                }
                            }
                        };
                        printDocument.Print();
                    }
                }
                _logger.LogInformation("Successfully printed job {jobId}", jobId);
                status = "Printed";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error printing job {jobId}", jobId);
                status = "Failed";
            }
            finally
            {
                if (hubConnection != null) // Null check before invoking
                {
                    await hubConnection.InvokeAsync("UpdateJobStatus", jobId, status, stoppingToken);
                    _logger.LogInformation("Updated job {jobId} status to {status}", jobId, status);
                }
            }
        });

        hubConnection.Reconnecting += error =>
        {
            _logger.LogWarning("Connection reconnecting: {Error}", error?.Message);
            return Task.CompletedTask;
        };

        hubConnection.Reconnected += connectionId =>
        {
            _logger.LogInformation("Connection reconnected: {ConnectionId}", connectionId);
            // Re-register connector after reconnect
            if (hubConnection != null && _connectorId != Guid.Empty)
            {
                _ = hubConnection.InvokeAsync("RegisterConnector", _connectorId, stoppingToken);
                _ = SendAvailablePrinters(); // Call to send available printers
            }
            return Task.CompletedTask;
        };

        hubConnection.Closed += async (error) =>
        {
            _logger.LogError("Connection closed: {Error}", error?.Message);
            // If the connection closes unexpectedly, and _connectorId is not empty, it means the connection broke
            // for reasons other than explicit invalidation. Automatic reconnect should kick in.
            // If _connectorId is empty, it means InvalidateConnectorConfig was called.
        };

        await Task.CompletedTask; // Satisfy linter for synchronous event registrations.
    }
#pragma warning restore CS1998 // This async method lacks 'await' operators and will run synchronously

    private async Task SendAvailablePrinters()
    {
        if (_hubConnection == null || _hubConnection.State != HubConnectionState.Connected || _connectorId == Guid.Empty) return;

        var installedPrinters = new List<PrinterInfoDto>();
        string defaultPrinter = new PrintDocument().PrinterSettings.PrinterName;

        // Define a list of keywords to identify virtual printers (case-insensitive)
        var virtualPrinterKeywords = new List<string>
        {
            //"pdf",
            //"xps",
            //"onenote",
            //"fax",
            //"microsoft print to",
            //"document writer",
            //"easy print", // Common for RDP sessions
            //"remote desktop"
        };

        foreach (string printerName in PrinterSettings.InstalledPrinters)
        {
            // Check if the printer name contains any of the virtual printer keywords
            var isVirtualPrinter = false;
            foreach (var keyword in virtualPrinterKeywords)
            {
                if (printerName.ToLower().Contains(keyword))
                {
                    isVirtualPrinter = true;
                    _logger.LogInformation("Filtering out virtual printer: {PrinterName}", printerName);
                    break;
                }
            }

            if (!isVirtualPrinter)
            {
                installedPrinters.Add(new PrinterInfoDto(printerName, printerName.Equals(defaultPrinter, StringComparison.OrdinalIgnoreCase)));
            }
        }

        var request = new ReportPrintersRequest(_connectorId, installedPrinters);

        // Cache the printers locally within the worker
        _memoryCache.Set($"Printers:{_connectorId}", installedPrinters, TimeSpan.FromMinutes(1)); // Cache for a short duration, will be refreshed

        try
        {
            await _hubConnection.InvokeAsync("ReportPrinters", request);
            _logger.LogInformation("Reported {Count} available printers for connector {ConnectorId}", installedPrinters.Count, _connectorId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reporting printers for connector {ConnectorId}", _connectorId);
            // Check if the exception or its inner exception is indicative of an unknown connector ID
            var baseExceptionMessage = ex.InnerException?.Message ?? ex.Message;
            if (baseExceptionMessage.Contains("Unknown PrintConnector ID") || baseExceptionMessage.Contains("Please re-pair your worker"))
            {
                _logger.LogWarning("HubException (identified by message) caught while reporting printers. Invalidating connector config.");
                await InvalidateConnectorConfig(); // This will set _connectorId to Guid.Empty, triggering re-setup
            }
        }
    }

    private async Task InvalidateConnectorConfig()
    {
        _logger.LogInformation("Invalidating connector config and forcing re-pairing.");
        try
        {
            if (System.IO.File.Exists(ConfigFilePath))
            {
                System.IO.File.Delete(ConfigFilePath);
                _logger.LogInformation("Deleted config.json.");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting config.json. Manual deletion may be required.");
        }

        _connectorId = Guid.Empty;
        _jwtToken = null;

        // Explicitly stop and dispose the current hub connection
        if (_hubConnection != null)
        {
            _logger.LogInformation("Stopping and disposing current SignalR HubConnection.");
            try
            {
                await _hubConnection.StopAsync();
                await _hubConnection.DisposeAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error stopping or disposing HubConnection during invalidation.");
            }
            _hubConnection = null;
        }
    }

    private async Task SetupConnector(CancellationToken stoppingToken)
    {
        var apiBaseUrl = _configuration["SPSApi:Url"]; // Declared once at the top

        if (System.IO.File.Exists(ConfigFilePath))
        {
            try
            {
                var configContent = await System.IO.File.ReadAllTextAsync(ConfigFilePath, stoppingToken);
                var config = JsonConvert.DeserializeObject<ConnectorConfig>(configContent);
                if (config != null)
                {
                    _connectorId = config.PrintConnectorId;
                    _jwtToken = config.JwtToken;
                    _logger.LogInformation("Loaded existing connector config. ConnectorId: {ConnectorId}", _connectorId);

                    // *** New: Validate existing config with the backend ***
                    _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _jwtToken);

                    try
                    {
                        var validateRequest = new ValidateConnectorRequest(_connectorId);
                        var validateResponse = await _httpClient.PostAsJsonAsync($"{apiBaseUrl}/api/printconnectors/validate", validateRequest, stoppingToken);
                        validateResponse.EnsureSuccessStatusCode(); // Throws if not 2xx
                        var validationResult = await validateResponse.Content.ReadFromJsonAsync<ValidateConnectorResponse>(cancellationToken: stoppingToken);

                        if (validationResult?.IsValid == true)
                        {
                            _logger.LogInformation("Existing connector config {ConnectorId} successfully validated with backend.", _connectorId);
                            return; // Config is valid, proceed with existing
                        }
                        else
                        {
                            _logger.LogWarning("Existing connector config {ConnectorId} found invalid by backend validation. Re-pairing required.", _connectorId);
                            // Fall through to re-pairing logic
                        }
                    }
                    catch (HttpRequestException httpEx)
                    {
                        _logger.LogError(httpEx, "HTTP error during backend validation of existing connector {ConnectorId}. Re-pairing required.", _connectorId);
                        // Fall through to re-pairing logic
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error during backend validation of existing connector {ConnectorId}. Re-pairing required.", _connectorId);
                        // Fall through to re-pairing logic
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reading or deserializing config.json. Assuming invalid and forcing re-pairing.");
                // Fall through to re-pairing logic
            }
        }

        // If we reach here, either no config.json was found, or the existing one was invalid/corrupt.
        // Force invalidate current state and proceed with interactive re-pairing.
        if (_connectorId != Guid.Empty || _jwtToken != null)
        {
            _logger.LogInformation("Invalidating current worker state to force re-pairing.");
            await InvalidateConnectorConfig(); // Ensure clean slate and dispose hub if active
        }

        bool setupSuccessful = false;
        while (!setupSuccessful && !stoppingToken.IsCancellationRequested)
        {
            Console.Clear(); // Clear the console for a fresh re-prompt
            Console.Out.Flush(); // Explicitly flush output to ensure readiness for new input

            // Prompt for login and pair
            Console.WriteLine("\nSecure Print Connector Setup (Re-pairing required)");
            Console.Write("Enter your email: ");
            var email = Console.ReadLine();
            Console.Write("Enter your password: ");
            var password = Console.ReadLine();
            Console.Write("Enter machine name (e.g., Office Printer 1): ");
            var machineName = Console.ReadLine();

            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password) || string.IsNullOrEmpty(machineName))
            {
                _logger.LogError("Email, password, and machine name cannot be empty during setup.");
                Console.WriteLine("Error: Email, password, and machine name cannot be empty. Please try again.");
                // Removed Console.In.Peek() loop as it can sometimes cause blocking issues.
                await Task.Delay(500, stoppingToken); // Short delay to allow console to process error before re-prompt
                continue;
            }

            var loginRequest = new LoginRequest(email, password);
            LoginResponse? loginData = null; // Made nullable
            try
            {
                var loginResponse = await _httpClient.PostAsJsonAsync($"{apiBaseUrl}/api/auth/login", loginRequest, stoppingToken);
                loginResponse.EnsureSuccessStatusCode();
                loginData = await loginResponse.Content.ReadFromJsonAsync<LoginResponse>(cancellationToken: stoppingToken);
                _jwtToken = loginData?.JwtToken;
            }
            catch (HttpRequestException httpEx)
            {
                _logger.LogError(httpEx, "Network error during login for connector setup.");
                Console.WriteLine($"Error: Could not connect to the backend API at {apiBaseUrl}. Please ensure the SPS.Api backend is running and accessible. ({httpEx.Message})");
                // Removed Console.In.Peek() loop.
                await Task.Delay(500, stoppingToken); // Short delay
                continue;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during login for connector setup.");
                Console.WriteLine("Error: Failed to log in. Please check your email/password and try again.");
                // Removed Console.In.Peek() loop.
                await Task.Delay(500, stoppingToken); // Short delay
                continue;
            }


            if (_jwtToken == null)
            {
                _logger.LogError("Failed to retrieve JWT token after login.");
                Console.WriteLine("Error: Failed to retrieve JWT token. Please try again.");
                // Removed Console.In.Peek() loop.
                await Task.Delay(500, stoppingToken); // Short delay
                continue;
            }

            _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _jwtToken);

            PairingResponse? pairingData = null; // Made nullable
            try
            {
                var pairingRequest = new PairingRequest(machineName);
                var pairingResponse = await _httpClient.PostAsJsonAsync($"{apiBaseUrl}/api/printconnectors/pair", pairingRequest, stoppingToken);
                pairingResponse.EnsureSuccessStatusCode();
                pairingData = await pairingResponse.Content.ReadFromJsonAsync<PairingResponse>(cancellationToken: stoppingToken);
                _connectorId = pairingData!.PrintConnectorId;
                _jwtToken = pairingData.JwtToken; // Update JWT with connector-specific token
            }
            catch (HttpRequestException httpEx)
            {
                _logger.LogError(httpEx, "Network error during pairing for connector setup.");
                Console.WriteLine($"Error: Could not connect to the backend API at {apiBaseUrl}. Please ensure the SPS.Api backend is running and accessible. ({httpEx.Message})");
                // Removed Console.In.Peek() loop.
                await Task.Delay(500, stoppingToken); // Short delay
                continue;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during pairing for connector setup.");
                Console.WriteLine("Error: Failed to pair connector. Please ensure machine name is unique or try again.");
                // Removed Console.In.Peek() loop.
                await Task.Delay(500, stoppingToken); // Short delay
                continue;
            }

            var configToSave = new ConnectorConfig(_connectorId, _jwtToken);
            await System.IO.File.WriteAllTextAsync(ConfigFilePath, JsonConvert.SerializeObject(configToSave), stoppingToken);
            _logger.LogInformation("New connector paired and config saved. ConnectorId: {ConnectorId}", _connectorId);
            setupSuccessful = true; // Mark as successful to exit the loop
        }
    }
}

public record ConnectorConfig(Guid PrintConnectorId, string JwtToken);
