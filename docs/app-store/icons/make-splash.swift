import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let iconPath = CommandLine.arguments[1]
let outPath = CommandLine.arguments[2]
let sizeCG: CGFloat = 2732
let size = Int(sizeCG)
let iconSide: CGFloat = 540

guard let iconSrc = CGImageSourceCreateWithURL(URL(fileURLWithPath: iconPath) as CFURL, nil),
      let icon = CGImageSourceCreateImageAtIndex(iconSrc, 0, nil) else {
  fputs("failed to load icon\n", stderr)
  exit(1)
}

let cs = CGColorSpaceCreateDeviceRGB()
let bpr = size * 4
let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: bpr * size)
defer { buf.deallocate() }
guard let ctx = CGContext(
  data: buf, width: size, height: size,
  bitsPerComponent: 8, bytesPerRow: bpr, space: cs,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
  fputs("failed to create context\n", stderr)
  exit(1)
}

// Portal home background: linear-gradient(165deg, #d8eefc, #eef8f1 55%, #f4faf6)
let colors = [
  CGColor(srgbRed: 0xd8/255, green: 0xee/255, blue: 0xfc/255, alpha: 1),
  CGColor(srgbRed: 0xee/255, green: 0xf8/255, blue: 0xf1/255, alpha: 1),
  CGColor(srgbRed: 0xf4/255, green: 0xfa/255, blue: 0xf6/255, alpha: 1),
] as CFArray
let gradient = CGGradient(colorsSpace: cs, colors: colors, locations: [0, 0.55, 1])!
ctx.drawLinearGradient(
  gradient,
  start: CGPoint(x: sizeCG * 0.15, y: sizeCG * 0.95),
  end: CGPoint(x: sizeCG * 0.85, y: sizeCG * 0.05),
  options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
)

// Warm radial #fff6d6 top-left
let warm = [
  CGColor(srgbRed: 1, green: 0xf6/255, blue: 0xd6/255, alpha: 0.85),
  CGColor(srgbRed: 1, green: 0xf6/255, blue: 0xd6/255, alpha: 0),
] as CFArray
let warmGrad = CGGradient(colorsSpace: cs, colors: warm, locations: [0, 1])!
ctx.drawRadialGradient(
  warmGrad,
  startCenter: CGPoint(x: sizeCG * 0.08, y: sizeCG * 0.92),
  startRadius: 0,
  endCenter: CGPoint(x: sizeCG * 0.08, y: sizeCG * 0.92),
  endRadius: sizeCG * 0.55,
  options: [.drawsAfterEndLocation]
)

let x = (sizeCG - iconSide) / 2
let y = (sizeCG - iconSide) / 2
let rect = CGRect(x: x, y: y, width: iconSide, height: iconSide)
let path = CGPath(
  roundedRect: rect,
  cornerWidth: iconSide * 0.2237,
  cornerHeight: iconSide * 0.2237,
  transform: nil
)
ctx.saveGState()
ctx.addPath(path)
ctx.clip()
ctx.draw(icon, in: rect)
ctx.restoreGState()

guard let outCG = ctx.makeImage() else {
  fputs("failed to make image\n", stderr)
  exit(1)
}
guard let dest = CGImageDestinationCreateWithURL(
  URL(fileURLWithPath: outPath) as CFURL,
  UTType.png.identifier as CFString,
  1,
  nil
) else {
  fputs("failed to create destination\n", stderr)
  exit(1)
}
CGImageDestinationAddImage(dest, outCG, nil)
CGImageDestinationFinalize(dest)
print("wrote \(outPath)")
