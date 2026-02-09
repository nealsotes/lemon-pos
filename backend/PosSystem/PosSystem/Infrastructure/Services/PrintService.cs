using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using System.Text;

namespace PosSystem.Infrastructure.Services;

public class PrintService : IPrintService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<PrintService> _logger;

    public PrintService(IConfiguration configuration, ILogger<PrintService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<List<string>> GetAvailablePrintersAsync()
    {
        try
        {
            var printers = new List<string>();
            
            // On Windows, use System.Drawing.Printing
            if (OperatingSystem.IsWindows())
            {
                foreach (string printerName in System.Drawing.Printing.PrinterSettings.InstalledPrinters)
                {
                    printers.Add(printerName);
                }
            }
            else
            {
                // On Linux/Mac, use lpstat or similar
                // For now, return empty list - can be extended
                _logger.LogWarning("Printer detection not fully implemented for this platform");
            }

            return await Task.FromResult(printers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting available printers");
            return new List<string>();
        }
    }

    public async Task<bool> PrintReceiptAsync(ReceiptData receiptData, bool openDrawer = true)
    {
        try
        {
            var printerName = _configuration["Printer:Name"];
            
            // If no printer configured, try to get default
            if (string.IsNullOrEmpty(printerName))
            {
                printerName = GetDefaultPrinter();
                if (string.IsNullOrEmpty(printerName))
                {
                    _logger.LogError("No printer configured and no default printer found");
                    return false;
                }
                _logger.LogInformation($"Using default printer: {printerName}");
            }

            _logger.LogInformation($"Attempting to print to printer: {printerName}");

            // Build ESC/POS commands as byte array directly (preserves binary sequences)
            var byteData = BuildEscPosCommandsAsBytes(receiptData, openDrawer);

            if (OperatingSystem.IsWindows())
            {
                return await PrintRawWindowsAsync(printerName, byteData);
            }
            else if (OperatingSystem.IsLinux())
            {
                return await PrintRawLinuxAsync(printerName, byteData);
            }
            else if (OperatingSystem.IsMacOS())
            {
                return await PrintRawMacAsync(printerName, byteData);
            }

            _logger.LogWarning("Printing not supported on this platform");
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error printing receipt");
            return false;
        }
    }

    public async Task<bool> OpenCashDrawerAsync(string? printerName = null)
    {
        try
        {
            printerName ??= _configuration["Printer:Name"] ?? GetDefaultPrinter();
            
            if (string.IsNullOrEmpty(printerName))
            {
                _logger.LogError("No printer configured");
                return false;
            }

            // ESC/POS drawer kick command as bytes
            var byteData = new byte[] { 0x1B, 0x70, 0x00, 0x32, 0xFA }; // Pin 2, 100ms pulse
            // Also try pin 5 as backup
            var pin5Command = new byte[] { 0x1B, 0x70, 0x01, 0x32, 0xFA };
            var combinedDrawerCommand = new byte[byteData.Length + pin5Command.Length];
            Array.Copy(byteData, 0, combinedDrawerCommand, 0, byteData.Length);
            Array.Copy(pin5Command, 0, combinedDrawerCommand, byteData.Length, pin5Command.Length);
            byteData = combinedDrawerCommand;

            if (OperatingSystem.IsWindows())
            {
                return await PrintRawWindowsAsync(printerName, byteData);
            }
            else if (OperatingSystem.IsLinux())
            {
                return await PrintRawLinuxAsync(printerName, byteData);
            }
            else if (OperatingSystem.IsMacOS())
            {
                return await PrintRawMacAsync(printerName, byteData);
            }

            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error opening cash drawer");
            return false;
        }
    }

    public async Task<bool> TestPrintAsync(string? printerName = null)
    {
        try
        {
            printerName ??= _configuration["Printer:Name"] ?? GetDefaultPrinter();
            
            var testReceipt = new ReceiptData
            {
                ReceiptNumber = "TEST-" + DateTime.Now.ToString("yyyyMMddHHmmss"),
                Timestamp = DateTime.Now,
                CustomerName = "Test Customer",
                PaymentMethod = "cash",
                Items = new List<ReceiptItem>
                {
                    new ReceiptItem { Name = "Test Item 1", Quantity = 2, Price = 10.00m },
                    new ReceiptItem { Name = "Test Item 2", Quantity = 1, Price = 25.50m }
                },
                Subtotal = 45.50m,
                Tax = 0m,
                Total = 45.50m,
                AmountReceived = 50.00m,
                Change = 4.50m,
                Notes = "This is a test receipt"
            };

            return await PrintReceiptAsync(testReceipt, false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error printing test receipt");
            return false;
        }
    }

    /// <summary>
    /// Build ESC/POS commands as byte array (preserves binary sequences like null bytes)
    /// </summary>
    private byte[] BuildEscPosCommandsAsBytes(ReceiptData receiptData, bool openDrawer)
    {
        var bytes = new List<byte>();
        
        // Initialize printer
        bytes.Add(0x1B); // ESC
        bytes.Add((byte)'@');
        
        // Open cash drawer immediately if requested
        if (openDrawer)
        {
            // Pin 2, 100ms pulse
            bytes.Add(0x1B); bytes.Add(0x70); bytes.Add(0x00); bytes.Add(0x32); bytes.Add(0xFA);
            // Pin 5, 100ms pulse (backup)
            bytes.Add(0x1B); bytes.Add(0x70); bytes.Add(0x01); bytes.Add(0x32); bytes.Add(0xFA);
        }
        
        // Center alignment
        bytes.Add(0x1B); bytes.Add((byte)'a'); bytes.Add(0x01);
        
        // Store name (large text)
        bytes.Add(0x1B); bytes.Add((byte)'!'); bytes.Add(0x10); // Double height only (reduced from double height and width)
        AddString(bytes, "finnbites POS\n");
        bytes.Add(0x1B); bytes.Add((byte)'!'); bytes.Add(0x00); // Reset text size
        
        AddString(bytes, "Point of Sale Terminal\n");
        AddString(bytes, $"{receiptData.Timestamp:MMM dd, yyyy hh:mm tt}\n");
        AddString(bytes, new string('-', 32) + "\n");
        
        // Left alignment
        bytes.Add(0x1B); bytes.Add((byte)'a'); bytes.Add(0x00);
        
        // Transaction details
        AddString(bytes, $"Receipt #: {receiptData.ReceiptNumber}\n");
        AddString(bytes, $"Payment: {receiptData.PaymentMethod}\n");
        
        // Service Type (matching receipt sidebar)
        var serviceTypeDisplay = receiptData.ServiceType == ServiceType.DineIn ? "Dine-in" : "Take-out";
        AddString(bytes, $"Service Type: {serviceTypeDisplay}\n");
        
        if (!string.IsNullOrEmpty(receiptData.CustomerName) && receiptData.CustomerName != "Walk-in Customer")
        {
            AddString(bytes, $"Customer: {receiptData.CustomerName}\n");
        }
        
        if (!string.IsNullOrEmpty(receiptData.CustomerPhone))
        {
            AddString(bytes, $"Phone: {receiptData.CustomerPhone}\n");
        }
        
        if (!string.IsNullOrEmpty(receiptData.CustomerEmail))
        {
            AddString(bytes, $"Email: {receiptData.CustomerEmail}\n");
        }
        
        AddString(bytes, new string('-', 32) + "\n");
        
        // Items header
        bytes.Add(0x1B); bytes.Add((byte)'!'); bytes.Add(0x08); // Bold
        AddString(bytes, "Item                    Qty    Amount\n");
        bytes.Add(0x1B); bytes.Add((byte)'!'); bytes.Add(0x00); // Reset to normal size (ensure normal font for items and add-ons)
        
        // Items list
        // Font size is set to normal and will NOT reduce, even when items have add-ons
        foreach (var item in receiptData.Items)
        {
            // Ensure normal font size for each item (including add-ons)
            bytes.Add(0x1B); bytes.Add((byte)'!'); bytes.Add(0x00); // Explicitly set normal font size
            var itemLine = FormatItemLineDetailed(item.Name, item.Quantity, item.Price, item.Total, item.Temperature, item.AddOns);
            AddString(bytes, itemLine);
        }
        
        AddString(bytes, new string('-', 32) + "\n");
        
        // Calculate subtotal and VAT (12% in Philippines)
        // Product prices already include VAT, so we extract VAT from the total
        decimal vatRate = 0.12m; // 12% VAT in Philippines
        decimal total = receiptData.Total;
        
        // Extract VAT from total (since prices are VAT-inclusive)
        // Formula: Subtotal = Total / (1 + VAT rate)
        decimal subtotal = total / (1 + vatRate);
        decimal vatAmount = total - subtotal;
        
        // Totals section
        AddString(bytes, FormatTotalLine("Subtotal", subtotal));
        AddString(bytes, FormatTotalLine($"VAT ({(vatRate * 100):F0}%)", vatAmount));
        
        // Service Fee (matching receipt sidebar)
        if (receiptData.ServiceFee > 0)
        {
            var serviceTypeLabel = receiptData.ServiceType == ServiceType.DineIn ? "Dine-in" : "Take-out";
            AddString(bytes, FormatTotalLine($"Service Fee ({serviceTypeLabel})", receiptData.ServiceFee));
        }
        
        // Total (bold)
        bytes.Add(0x1B); bytes.Add((byte)'!'); bytes.Add(0x08); // Bold only (reduced from double height, bold)
        AddString(bytes, FormatTotalLine("TOTAL", total));
        bytes.Add(0x1B); bytes.Add((byte)'!'); bytes.Add(0x00); // Reset
        
        // Payment details for cash
        if (receiptData.PaymentMethod.ToLower() == "cash" && receiptData.AmountReceived.HasValue)
        {
            AddString(bytes, new string('-', 32) + "\n");
            AddString(bytes, FormatTotalLine("Amount Received", receiptData.AmountReceived.Value));
            if (receiptData.Change.HasValue)
            {
                AddString(bytes, FormatTotalLine("Change", receiptData.Change.Value));
            }
        }
        
        // Notes
        if (!string.IsNullOrEmpty(receiptData.Notes))
        {
            AddString(bytes, new string('-', 32) + "\n");
            AddString(bytes, $"Notes: {receiptData.Notes}\n");
        }
        
        AddString(bytes, new string('-', 32) + "\n");
        
        // Footer - centered
        bytes.Add(0x1B); bytes.Add((byte)'a'); bytes.Add(0x01); // Center
        AddString(bytes, "Thank you for your purchase!\n");
        AddString(bytes, "Please keep this receipt\n");
        
        // Cut paper
        AddString(bytes, "\n\n");
        bytes.Add(0x1D); // GS
        bytes.Add((byte)'V');
        bytes.Add(0x41);
        bytes.Add(0x03); // Partial cut
        
        return bytes.ToArray();
    }
    
    /// <summary>
    /// Add string to byte list with proper UTF-8 encoding for ESC/POS
    /// This ensures special characters like peso symbol (₱) are encoded correctly
    /// </summary>
    private void AddString(List<byte> bytes, string str)
    {
        // Use UTF-8 encoding to properly handle peso symbol (₱) and other special characters
        // Most modern ESC/POS printers support UTF-8
        byte[] encodedBytes = System.Text.Encoding.UTF8.GetBytes(str);
        bytes.AddRange(encodedBytes);
    }
    
    /// <summary>
    /// Legacy method - kept for reference but not used
    /// </summary>
    private string BuildEscPosCommands(ReceiptData receiptData, bool openDrawer)
    {
        var sb = new StringBuilder();
        const char ESC = '\x1B';
        const char GS = '\x1D';

        // Initialize printer
        sb.Append(ESC + "@");

        // Open cash drawer immediately if requested
        if (openDrawer)
        {
            sb.Append("\x1B\x70\x00\x32\xFA"); // Pin 2, 100ms pulse
            sb.Append("\x1B\x70\x01\x32\xFA"); // Pin 5, 100ms pulse (backup)
        }

        // Center alignment
        sb.Append(ESC + "a" + "\x01");

        // Store name (large text)
        sb.Append(ESC + "!" + "\x30"); // Double height and width
        sb.Append("finnbites POS\n");
        sb.Append(ESC + "!" + "\x00"); // Reset text size

        sb.Append("Transaction Receipt\n");
        sb.Append(new string('-', 48) + "\n");

        // Left alignment
        sb.Append(ESC + "a" + "\x00");

        // Transaction details
        sb.Append($"Receipt #: {receiptData.ReceiptNumber}\n");
        sb.Append($"Date: {receiptData.Timestamp:MMM dd, yyyy hh:mm tt}\n");
        sb.Append($"Customer: {receiptData.CustomerName ?? "Walk-in Customer"}\n");
        
        if (!string.IsNullOrEmpty(receiptData.CustomerPhone))
        {
            sb.Append($"Phone: {receiptData.CustomerPhone}\n");
        }
        
        if (!string.IsNullOrEmpty(receiptData.CustomerEmail))
        {
            sb.Append($"Email: {receiptData.CustomerEmail}\n");
        }
        
        sb.Append($"Payment: {receiptData.PaymentMethod}\n");
        sb.Append(new string('-', 48) + "\n");

        // Items header
        sb.Append(ESC + "!" + "\x08"); // Bold
        sb.Append("Items\n");
        sb.Append(ESC + "!" + "\x00"); // Reset

        // Items list
        foreach (var item in receiptData.Items)
        {
            var itemLine = FormatItemLine(item.Name, item.Quantity, item.Total);
            sb.Append(itemLine);
        }

        sb.Append(new string('-', 48) + "\n");

        // Calculate subtotal and VAT (12% in Philippines)
        // Product prices already include VAT, so we extract VAT from the total
        decimal vatRate = 0.12m; // 12% VAT in Philippines
        decimal total = receiptData.Total;
        
        // Extract VAT from total (since prices are VAT-inclusive)
        // Formula: Subtotal = Total / (1 + VAT rate)
        decimal subtotal = total / (1 + vatRate);
        decimal vatAmount = total - subtotal;
        
        // Totals section
        sb.Append(FormatTotalLine("Subtotal", subtotal));
        sb.Append(FormatTotalLine($"VAT ({(vatRate * 100):F0}%)", vatAmount));
        
        // Total (bold)
        sb.Append(ESC + "!" + "\x08"); // Bold only (reduced from double height, bold)
        sb.Append(FormatTotalLine("TOTAL", total));
        sb.Append(ESC + "!" + "\x00"); // Reset

        // Payment details for cash
        if (receiptData.PaymentMethod.ToLower() == "cash" && receiptData.AmountReceived.HasValue)
        {
            sb.Append(new string('-', 48) + "\n");
            sb.Append(FormatTotalLine("Amount Received", receiptData.AmountReceived.Value));
            if (receiptData.Change.HasValue)
            {
                sb.Append(FormatTotalLine("Change", receiptData.Change.Value));
            }
        }

        // Notes
        if (!string.IsNullOrEmpty(receiptData.Notes))
        {
            sb.Append(new string('-', 48) + "\n");
            sb.Append($"Notes: {receiptData.Notes}\n");
        }

        sb.Append(new string('-', 48) + "\n");

        // Footer - centered
        sb.Append(ESC + "a" + "\x01"); // Center
        sb.Append("Thank you for your purchase!\n");
        sb.Append("Please keep this receipt\n");

        // Cut paper
        sb.Append("\n\n");
        sb.Append(GS + "V" + "\x41" + "\x03"); // Partial cut

        return sb.ToString();
    }

    private string FormatItemLine(string name, int quantity, decimal total)
    {
        const int maxNameLength = 20;
        var truncatedName = name.Length > maxNameLength 
            ? name.Substring(0, maxNameLength - 2) + ".." 
            : name;
        
        var qtyStr = $"x{quantity}";
        var priceStr = FormatPrice(total);
        
        // Format: "Item Name x2          Php 100.00"
        var nameQtyPart = $"{truncatedName} {qtyStr}";
        // Calculate spacing accounting for price string length (includes "Php " prefix)
        var spacing = Math.Max(1, 32 - nameQtyPart.Length - priceStr.Length);
        
        return $"{nameQtyPart}{new string(' ', spacing)}{priceStr}\n";
    }

    private string FormatItemLineDetailed(
        string name, 
        int quantity, 
        decimal unitPrice,
        decimal total,
        string? temperature = null,
        List<ReceiptAddOn>? addOns = null)
    {
        const int maxNameLength = 18;
        var truncatedName = name.Length > maxNameLength 
            ? name.Substring(0, maxNameLength - 2) + ".." 
            : name;
        
        // Add temperature indicator
        var tempIndicator = string.Empty;
        if (temperature == "hot")
        {
            tempIndicator = " (hot)";
        }
        else if (temperature == "cold")
        {
            tempIndicator = " (Iced)";
        }
        
        // Format: "Item Name (hot/Iced) x2     Php 100.00"
        var nameQtyPart = $"{truncatedName}{tempIndicator} x{quantity}";
        
        // Format add-ons - display each on its own line for better readability
        var addOnsText = string.Empty;
        if (addOns != null && addOns.Count > 0)
        {
            // Format each add-on on a separate indented line
            addOnsText = "\n";
            foreach (var addOn in addOns)
            {
                var addOnLine = $"  + {addOn.Name}";
                var addOnPriceStr = FormatPrice(addOn.Price);
                var addOnSpacing = Math.Max(1, 30 - addOnLine.Length - addOnPriceStr.Length);
                addOnsText += $"{addOnLine}{new string(' ', addOnSpacing)}{addOnPriceStr}\n";
            }
        }
        
        var priceStr = FormatPrice(total);
        var spacing = Math.Max(1, 32 - nameQtyPart.Length - priceStr.Length);
        
        return $"{nameQtyPart}{new string(' ', spacing)}{priceStr}{addOnsText}";
    }

    private string FormatTotalLine(string label, decimal amount)
    {
        var priceStr = FormatPrice(amount);
        // Calculate spacing accounting for price string length (includes "Php " prefix)
        var spacing = Math.Max(1, 32 - label.Length - priceStr.Length);
        return $"{label}{new string(' ', spacing)}{priceStr}\n";
    }
    
    private string FormatPrice(decimal amount)
    {
        // Use "Php" instead of ₱ symbol for thermal printers
        // Most ESC/POS printers don't support the peso symbol (₱) in their character set
        // This ensures reliable printing across all thermal printer models
        return $"Php {amount:F2}";
    }
    

    private string? GetDefaultPrinter()
    {
        if (OperatingSystem.IsWindows())
        {
            try
            {
                var settings = new System.Drawing.Printing.PrinterSettings();
                return settings.PrinterName;
            }
            catch
            {
                return null;
            }
        }
        return null;
    }

    private async Task<bool> PrintRawWindowsAsync(string printerName, byte[] data)
    {
        try
        {
            return await Task.Run(() =>
            {
                // Use Windows API for raw printing
                // This sends ESC/POS commands directly to the printer
                IntPtr hPrinter = IntPtr.Zero;
                try
                {
                    // Open printer with admin access to ensure raw printing works
                    var printerDefaults = new PRINTER_DEFAULTS
                    {
                        pDatatype = "RAW",  // Set RAW datatype at printer level
                        pDevMode = IntPtr.Zero,
                        DesiredAccess = PRINTER_ACCESS_MASK.PRINTER_ALL_ACCESS  // Full access to bypass driver
                    };

                    if (!OpenPrinter(printerName, out hPrinter, ref printerDefaults))
                    {
                        var error = System.Runtime.InteropServices.Marshal.GetLastWin32Error();
                        _logger.LogError($"Failed to open printer '{printerName}'. Error code: {error}. Make sure the printer is installed and accessible.");
                        return false;
                    }
                    
                    _logger.LogInformation($"Successfully opened printer: {printerName}");

                    // Create document info with RAW datatype to bypass driver processing
                    var docInfo = new DOC_INFO_1
                    {
                        pDocName = "finnbites Receipt",
                        pOutputFile = null,
                        pDatatype = "RAW"  // RAW mode bypasses driver formatting
                    };

                    // Start document
                    var docId = StartDocPrinter(hPrinter, 1, ref docInfo);
                    if (docId <= 0)
                    {
                        _logger.LogError("Failed to start print job");
                        return false;
                    }

                    try
                    {
                        // Try writing without StartPagePrinter/EndPagePrinter to avoid driver interference
                        // Some drivers add commands when StartPagePrinter is called
                        
                        // Write raw data directly - bypassing page boundaries
                        int bytesWritten = 0;
                        if (!WritePrinter(hPrinter, data, data.Length, out bytesWritten))
                        {
                            var error = System.Runtime.InteropServices.Marshal.GetLastWin32Error();
                            _logger.LogError($"Failed to write to printer. Error code: {error}. Bytes written: {bytesWritten}");
                            
                            // If that failed, try with StartPagePrinter (fallback)
                            if (StartPagePrinter(hPrinter))
                            {
                                if (WritePrinter(hPrinter, data, data.Length, out bytesWritten))
                                {
                                    _logger.LogInformation($"Successfully wrote {bytesWritten} bytes using page method");
                                    EndPagePrinter(hPrinter);
                                }
                                else
                                {
                                    return false;
                                }
                            }
                            else
                            {
                                return false;
                            }
                        }
                        else
                        {
                            _logger.LogInformation($"Successfully wrote {bytesWritten} bytes to printer (expected {data.Length})");
                        }
                    }
                    finally
                    {
                        // End document
                        if (!EndDocPrinter(hPrinter))
                        {
                            _logger.LogWarning("EndDocPrinter returned false");
                        }
                    }

                    return true;
                }
                finally
                {
                    if (hPrinter != IntPtr.Zero)
                    {
                        ClosePrinter(hPrinter);
                    }
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error printing to {printerName} on Windows");
            return false;
        }
    }

    // Windows API declarations for raw printing
    [System.Runtime.InteropServices.DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = System.Runtime.InteropServices.CharSet.Unicode, ExactSpelling = false, CallingConvention = System.Runtime.InteropServices.CallingConvention.StdCall)]
    private static extern bool OpenPrinter([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, ref PRINTER_DEFAULTS pd);

    [System.Runtime.InteropServices.DllImport("winspool.drv", EntryPoint = "ClosePrinter", CharSet = System.Runtime.InteropServices.CharSet.Auto, ExactSpelling = false, CallingConvention = System.Runtime.InteropServices.CallingConvention.StdCall)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [System.Runtime.InteropServices.DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = System.Runtime.InteropServices.CharSet.Unicode, ExactSpelling = false, CallingConvention = System.Runtime.InteropServices.CallingConvention.StdCall)]
    private static extern int StartDocPrinter(IntPtr hPrinter, int level, [System.Runtime.InteropServices.In] ref DOC_INFO_1 di);

    [System.Runtime.InteropServices.DllImport("winspool.drv", EntryPoint = "EndDocPrinter", CharSet = System.Runtime.InteropServices.CharSet.Auto, ExactSpelling = false, CallingConvention = System.Runtime.InteropServices.CallingConvention.StdCall)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [System.Runtime.InteropServices.DllImport("winspool.drv", EntryPoint = "StartPagePrinter", CharSet = System.Runtime.InteropServices.CharSet.Auto, ExactSpelling = false, CallingConvention = System.Runtime.InteropServices.CallingConvention.StdCall)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [System.Runtime.InteropServices.DllImport("winspool.drv", EntryPoint = "EndPagePrinter", CharSet = System.Runtime.InteropServices.CharSet.Auto, ExactSpelling = false, CallingConvention = System.Runtime.InteropServices.CallingConvention.StdCall)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [System.Runtime.InteropServices.DllImport("winspool.drv", EntryPoint = "WritePrinter", CharSet = System.Runtime.InteropServices.CharSet.Auto, ExactSpelling = false, CallingConvention = System.Runtime.InteropServices.CallingConvention.StdCall)]
    private static extern bool WritePrinter(IntPtr hPrinter, [System.Runtime.InteropServices.In] byte[] pBytes, int dwCount, out int dwWritten);

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    private struct PRINTER_DEFAULTS
    {
        [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)]
        public string? pDatatype;
        public IntPtr pDevMode;
        public PRINTER_ACCESS_MASK DesiredAccess;
    }

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    private struct DOC_INFO_1
    {
        [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)]
        public string pDocName;
        [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)]
        public string? pOutputFile;
        [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)]
        public string pDatatype;
    }

    private enum PRINTER_ACCESS_MASK
    {
        PRINTER_ACCESS_USE = 0x00000008,
        PRINTER_ACCESS_ADMINISTER = 0x00000004,
        PRINTER_ALL_ACCESS = 0x000F000C
    }

    /// <summary>
    /// Convert string to byte array, preserving binary escape sequences
    /// This ensures ESC/POS commands like \x1B are sent as actual bytes (27) not text
    /// </summary>
    private byte[] StringToBytes(string str)
    {
        var bytes = new byte[str.Length];
        for (int i = 0; i < str.Length; i++)
        {
            bytes[i] = (byte)str[i];
        }
        return bytes;
    }

    private async Task<bool> PrintRawLinuxAsync(string printerName, byte[] data)
    {
        try
        {
            return await Task.Run(() =>
            {
                // Use lp command for Linux printing
                var process = new System.Diagnostics.Process
                {
                    StartInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "lp",
                        Arguments = $"-d {printerName}",
                        UseShellExecute = false,
                        RedirectStandardInput = true,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                process.StandardInput.BaseStream.Write(data, 0, data.Length);
                process.StandardInput.Close();
                process.WaitForExit();

                return process.ExitCode == 0;
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error printing to {printerName} on Linux");
            return false;
        }
    }

    private async Task<bool> PrintRawMacAsync(string printerName, byte[] data)
    {
        try
        {
            return await Task.Run(() =>
            {
                // Use lpr command for macOS printing
                var process = new System.Diagnostics.Process
                {
                    StartInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "lpr",
                        Arguments = $"-P {printerName}",
                        UseShellExecute = false,
                        RedirectStandardInput = true,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                process.StandardInput.BaseStream.Write(data, 0, data.Length);
                process.StandardInput.Close();
                process.WaitForExit();

                return process.ExitCode == 0;
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error printing to {printerName} on macOS");
            return false;
        }
    }
}

