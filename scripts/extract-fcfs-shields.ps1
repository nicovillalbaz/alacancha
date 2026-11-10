# Recortes deterministas del afiche recibido. No se redibuja ningún escudo.
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PSScriptRoot '..\img\FCFS\EQUIPOS PARTICIPANTES.jpg.jpeg'
$outputDir = Join-Path $PSScriptRoot '..\img\FCFS\escudos'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $sourcePath).Path)
$specs = @(
  @{Name='mc-cavi'; X=88;Y=544;W=188;H=201;Kind='polygon';Points=@(@(93,2),@(105,35),@(152,39),@(186,113),@(150,190),@(40,190),@(1,113),@(37,39),@(82,35))},
  @{Name='8-de-diciembre';X=289;Y=574;W=165;H=170;Kind='ellipse'},
  @{Name='juan-pablo-ii';X=476;Y=563;W=134;H=184;Kind='polygon';Points=@(@(15,2),@(50,2),@(67,11),@(116,4),@(134,79),@(131,176),@(41,183),@(2,136),@(1,17))},
  @{Name='barrio-nuevo';X=630;Y=564;W=175;H=181;Kind='ellipse'},
  @{Name='mercury';X=817;Y=554;W=189;H=195;Kind='ellipse'},
  @{Name='cosmos-04';X=82;Y=808;W=198;H=207;Kind='ellipse'},
  @{Name='ytororo';X=293;Y=821;W=158;H=190;Kind='polygon';Points=@(@(76,9),@(116,28),@(154,24),@(151,127),@(77,188),@(5,130),@(1,25),@(39,28))},
  @{Name='teniente-farina';X=465;Y=806;W=152;H=208;Kind='polygon';Points=@(@(75,2),@(92,39),@(116,26),@(121,62),@(150,86),@(133,193),@(16,207),@(2,87),@(34,59),@(35,27),@(58,38))},
  @{Name='ajbl';X=631;Y=817;W=175;H=190;Kind='ellipse'},
  @{Name='sporting-cruzado';X=822;Y=801;W=179;H=211;Kind='polygon';Points=@(@(88,1),@(101,39),@(146,39),@(174,83),@(145,169),@(88,210),@(30,169),@(2,83),@(30,39),@(75,39))}
)
try {
  foreach ($item in $specs) {
    $target = New-Object System.Drawing.Bitmap($item.W, $item.H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    try {
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.Clear([System.Drawing.Color]::Transparent)
      if ($item.Kind -eq 'ellipse') {
        $path.AddEllipse(1, 1, $item.W - 2, $item.H - 2)
      } else {
        $points = @($item.Points | ForEach-Object { New-Object System.Drawing.Point([int]$_[0], [int]$_[1]) })
        $path.AddPolygon([System.Drawing.Point[]]$points)
      }
      $graphics.SetClip($path)
      $destinationRect = New-Object System.Drawing.Rectangle(0, 0, $item.W, $item.H)
      $sourceRect = New-Object System.Drawing.Rectangle($item.X, $item.Y, $item.W, $item.H)
      $graphics.DrawImage($source, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
    } finally {
      $path.Dispose()
      $graphics.Dispose()
    }
    # Quita el verde del afiche que llega al borde del recorte; conserva verdes interiores del emblema.
    $queue = [System.Collections.Generic.Queue[int]]::new()
    $queued = [bool[]]::new($item.W * $item.H)
    function IsPosterGreen($pixel) { return $pixel.A -gt 90 -and $pixel.G -ge 18 -and $pixel.G -gt ($pixel.R + 8) -and $pixel.G -gt ($pixel.B + 8) }
    for ($y=0; $y -lt $item.H; $y++) {
      for ($x=0; $x -lt $item.W; $x++) {
        $pixel = $target.GetPixel($x,$y)
        if (-not (IsPosterGreen $pixel)) { continue }
        $edge = $x -eq 0 -or $y -eq 0 -or $x -eq ($item.W-1) -or $y -eq ($item.H-1)
        if (-not $edge) {
          foreach ($neighbor in @(@(($x - 1),$y),@(($x + 1),$y),@($x,($y - 1)),@($x,($y + 1)))) {
            if ($target.GetPixel($neighbor[0],$neighbor[1]).A -lt 90) { $edge=$true; break }
          }
        }
        if ($edge) { $index=$y*$item.W+$x; $queued[$index]=$true; $queue.Enqueue($index) }
      }
    }
    while ($queue.Count -gt 0) {
      $index=$queue.Dequeue(); $x=$index % $item.W; $y=[int][math]::Floor($index/$item.W)
      $target.SetPixel($x,$y,[System.Drawing.Color]::Transparent)
      foreach ($neighbor in @(@(($x - 1),$y),@(($x + 1),$y),@($x,($y - 1)),@($x,($y + 1)))) {
        $nx=$neighbor[0];$ny=$neighbor[1]
        if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $item.W -or $ny -ge $item.H) { continue }
        $next=$ny*$item.W+$nx
        if ($queued[$next]) { continue }
        $candidate=$target.GetPixel($nx,$ny)
        if (IsPosterGreen $candidate) { $queued[$next]=$true; $queue.Enqueue($next) }
      }
    }
    try {
      $target.Save((Join-Path $outputDir ($item.Name + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $target.Dispose() }
  }
} finally { $source.Dispose() }
Write-Output "Extraídos $($specs.Count) escudos en $outputDir"
