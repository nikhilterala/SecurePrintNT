using Microsoft.Extensions.Logging;
using PdfiumViewer;
using System;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Threading.Tasks;
using System.Linq;

namespace SPS.PrintConnector.Services
{
    public class PrintService : IPrintService
    {
        private readonly ILogger<PrintService> _logger;

        public PrintService(ILogger<PrintService> logger)
        {
            _logger = logger;
        }

        public async Task PrintPdfAsync(string filePath, string printerName)
        {
            _logger.LogInformation("Attempting to print file {FilePath} to printer {PrinterName}", filePath, printerName);

            if (!File.Exists(filePath))
            {
                _logger.LogError("File not found: {FilePath}", filePath);
                throw new FileNotFoundException($"File not found: {filePath}");
            }

            try
            {
                await Task.Run(() =>
                {
                    using (var document = PdfDocument.Load(filePath))
                    {
                        using (var printDocument = document.CreatePrintDocument())
                        {
                            printDocument.PrinterSettings.PrinterName = printerName;
                            printDocument.PrinterSettings.Copies = 1; // Always print one copy

                            // Handle cases where the printer doesn't exist
                            if (!printDocument.PrinterSettings.IsValid)
                            {
                                _logger.LogError("Printer '{PrinterName}' is not valid or not found.", printerName);
                                throw new InvalidOperationException($"Printer '{printerName}' is not valid or not found.");
                            }

                            _logger.LogInformation("Printing document {FileName} to {PrinterName}", Path.GetFileName(filePath), printerName);
                            printDocument.Print();
                            _logger.LogInformation("Print job for {FileName} sent to {PrinterName} successfully.", Path.GetFileName(filePath), printerName);
                        }
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error printing PDF file {FilePath} to printer {PrinterName}", filePath, printerName);
                throw;
            }
        }

        public string[] GetAvailablePrinters()
        {
            return PrinterSettings.InstalledPrinters.Cast<string>().ToArray();
        }
    }
}
