Add-Type -AssemblyName System.Drawing

$width = 1600
$height = 1000
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::FromArgb(8, 25, 45))

$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle(0, 0, $width, $height)),
  [System.Drawing.Color]::FromArgb(17, 49, 88),
  [System.Drawing.Color]::FromArgb(11, 25, 40),
  90
)
$graphics.FillRectangle($gradient, 0, 0, $width, $height)

$skylineColor = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(35, 86, 125))
for ($x = 0; $x -lt $width; $x += 80) {
  $h = 180 + (($x / 80) % 5) * 35
  $graphics.FillRectangle($skylineColor, $x, $height - 250 - $h, 45, $h + 250)
}

$hillColor = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28, 125, 96))
for ($i = 0; $i -lt ($width + 120); $i += 160) {
  $points = @(
    [System.Drawing.Point]::new($i, 740),
    [System.Drawing.Point]::new($i + 80, 580),
    [System.Drawing.Point]::new($i + 160, 740),
    [System.Drawing.Point]::new($i + 160, $height),
    [System.Drawing.Point]::new($i, $height)
  )
  $graphics.FillPolygon($hillColor, $points)
}

$panelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(12, 22, 38))
$graphics.FillRoundRectangle($panelBrush, 30, 60, 1540, 880, 40)

$pipeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(82, 218, 138))
$pipeHighlight = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 247, 180))
foreach ($x in 300, 470, 700, 880, 1120, 1350) {
  $gapY = 360 + (($x / 100) % 120)
  $graphics.FillRectangle($pipeBrush, $x, 0, 120, $gapY)
  $graphics.FillRectangle($pipeBrush, $x, $gapY + 210, 120, $height - ($gapY + 210) - 50)
  $graphics.FillRectangle($pipeHighlight, $x - 14, $gapY - 26, 148, 38)
  $graphics.FillRectangle($pipeHighlight, $x - 14, $gapY + 210 - 12, 148, 38)
}

$bodyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(95, 148, 255))
$graphics.FillEllipse($bodyBrush, 220, 420, 180, 150)
$bodyPoints = @(
  [System.Drawing.Point]::new(250, 560),
  [System.Drawing.Point]::new(330, 430),
  [System.Drawing.Point]::new(450, 470),
  [System.Drawing.Point]::new(500, 590),
  [System.Drawing.Point]::new(420, 700),
  [System.Drawing.Point]::new(270, 690)
)
$graphics.FillPolygon($bodyBrush, $bodyPoints)

$skinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 205, 165))
$graphics.FillEllipse($skinBrush, 280, 260, 160, 140)

$hairBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(33, 24, 21))
for ($i = 0; $i -lt 3; $i++) {
  $pen = New-Object System.Drawing.Pen($hairBrush, 18)
  $graphics.DrawArc($pen, 300 + ($i * 32), 250, 100, 120, 180, 180)
}

$crownBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 210, 90))
$crownPoints = @(
  [System.Drawing.Point]::new(270, 325),
  [System.Drawing.Point]::new(330, 255),
  [System.Drawing.Point]::new(390, 330),
  [System.Drawing.Point]::new(450, 255),
  [System.Drawing.Point]::new(510, 325)
)
$graphics.FillPolygon($crownBrush, $crownPoints)

$eyeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(17, 24, 50))
$graphics.FillEllipse($eyeBrush, 320, 300, 22, 22)
$graphics.FillEllipse($eyeBrush, 400, 300, 22, 22)

$scarfBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 77, 123))
$graphics.FillRectangle($scarfBrush, 310, 470, 140, 50)

$fontTiny = New-Object System.Drawing.Font('Segoe UI', 48, [System.Drawing.FontStyle]::Bold)
$font = New-Object System.Drawing.Font('Segoe UI', 54, [System.Drawing.FontStyle]::Bold)
$fontBig = New-Object System.Drawing.Font('Segoe UI', 110, [System.Drawing.FontStyle]::Bold)

$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 245, 255))
$greenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(124, 247, 212))
$blueBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(118, 215, 255))
$panelTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 27, 45))

$graphics.DrawString('START.NG', $fontTiny, $whiteBrush, 110, 140)
$graphics.DrawString('FLAPPY', $fontBig, $greenBrush, 110, 220)
$graphics.DrawString('RUN', $fontBig, $blueBrush, 110, 340)

$graphics.FillRoundRectangle($panelTextBrush, 110, 480, 540, 90, 28)
$graphics.DrawString('Tap, click, or press Space', $font, $whiteBrush, 150, 495)

$bitmap.Save('cover.png', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

Write-Host 'cover.png created'
