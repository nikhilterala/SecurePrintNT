using System.Drawing.Printing;
using System.Threading.Tasks;

namespace SPS.PrintConnector.Services
{
    public interface IPrintService
    {
        Task PrintPdfAsync(string filePath, string printerName);
        string[] GetAvailablePrinters();
    }
}
