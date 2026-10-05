Add-Type -AssemblyName System.Drawing
foreach ($entry in @(@('icon-192.png',192), @('icon-512.png',512), @('icon-maskable.png',512), @('apple-touch-icon.png',180))) {
  $size = [int]$entry[1]
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#165f75'))
  $graphics.ScaleTransform($size / 512.0, $size / 512.0)
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#fffefa'),24)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawBezier($pen,176,100,176,250,336,262,336,412)
  $graphics.DrawBezier($pen,336,100,336,250,176,262,176,412)
  $graphics.DrawLine($pen,185,145,327,145)
  $graphics.DrawLine($pen,211,205,301,205)
  $graphics.DrawLine($pen,211,307,301,307)
  $graphics.DrawLine($pen,185,367,327,367)
  $bitmap.Save((Join-Path (Resolve-Path public) $entry[0]), [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
