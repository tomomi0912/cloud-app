param(
    [string]$pdfPath,
    [string]$mode      = 'ocr',
    [int]   $pageIndex = 0,
    [int]   $width     = 2000
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

[void][Windows.Data.Pdf.PdfDocument,                       Windows.Data.Pdf,        ContentType=WindowsRuntime]
[void][Windows.Data.Pdf.PdfPageRenderOptions,              Windows.Data.Pdf,        ContentType=WindowsRuntime]
[void][Windows.Storage.StorageFile,                        Windows.Storage,         ContentType=WindowsRuntime]
[void][Windows.Storage.FileAccessMode,                     Windows.Storage,         ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine,                        Windows.Media.Ocr,       ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder,             Windows.Graphics.Imaging,ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.SoftwareBitmap,            Windows.Graphics.Imaging,ContentType=WindowsRuntime]

# WinRT IAsyncOperation<T> : Status 0=Started 1=Completed 2=Canceled 3=Error
function WaitOp($op) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($op.Status -eq 0) {
        if ($sw.Elapsed.TotalSeconds -gt 60) { throw 'WinRT operation timeout' }
        Start-Sleep -Milliseconds 20
    }
    if ($op.Status -ne 1) { throw "WinRT operation failed (status=$($op.Status))" }
    return $op.GetResults()
}

# WinRT IAsyncAction
function WaitAction($op) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($op.Status -eq 0) {
        if ($sw.Elapsed.TotalSeconds -gt 60) { throw 'WinRT action timeout' }
        Start-Sleep -Milliseconds 20
    }
    if ($op.Status -ne 1) { throw "WinRT action failed (status=$($op.Status))" }
}

$file   = WaitOp ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfPath))
$pdfDoc = WaitOp ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file))

if ($mode -eq 'pagecount') {
    Write-Output $pdfDoc.PageCount
    exit 0
}

$page   = $pdfDoc.GetPage([uint32]$pageIndex)
$stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
$opts   = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
$opts.DestinationWidth = [uint32]$width

WaitAction ($page.RenderToStreamAsync($stream, $opts))

$stream.Seek(0)
$decoder = WaitOp ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
$bitmap  = WaitOp ($decoder.GetSoftwareBitmapAsync())

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { Write-Error 'OCR engine init failed'; exit 1 }

$result = WaitOp ($engine.RecognizeAsync($bitmap))
$result.Lines | ForEach-Object { $_.Text }
