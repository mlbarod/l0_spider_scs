import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { DefectScatterPlot } from "../components/DefectScatterPlot"
import { DEFECT_PLOT } from "./defectScatterCanvas.mjs"

const WIDTH = 1000
const MAX_CHART_IMAGE_BYTES = 5 * 1024 * 1024
const STYLE_PROPERTIES = ["fill", "stroke", "stroke-width", "stroke-dasharray", "font-family", "font-size", "font-weight", "opacity", "text-anchor", "dominant-baseline"]
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
const noop = () => {}

async function svgImage(svg, width, height) {
  // Inline computed styles so CSS variables and classes survive serialization.
  const clone = svg.cloneNode(true)
  const originals = [svg, ...svg.querySelectorAll("*")]
  const copies = [clone, ...clone.querySelectorAll("*")]
  originals.forEach((element, index) => {
    const style = getComputedStyle(element)
    for (const property of STYLE_PROPERTIES) copies[index].style.setProperty(property, style.getPropertyValue(property))
  })
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(width))
  clone.setAttribute("height", String(height))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Render a separate plot at the initial range; the visible chart's zoom and legend are untouched.
export async function renderDefectChartPng({ series, domain, pmRows }) {
  const container = document.createElement("div")
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${WIDTH}px;background:white;color:#172033;pointer-events:none`
  container.setAttribute("aria-hidden", "true")
  document.body.append(container)
  const root = createRoot(container)
  try {
    await document.fonts.ready
    flushSync(() => root.render(<DefectScatterPlot series={series} hidden={[]} domain={domain} pmRows={pmRows}
      onZoom={noop} onResetInitial={noop} onShowFullRange={noop} />))
    const ready = () => {
      const canvas = container.querySelector("canvas[data-defect-canvas]")
      // drawDefectScatter resizes the canvas from its 300x150 default when points are drawn.
      return canvas?.height === Math.round(DEFECT_PLOT.height * (window.devicePixelRatio || 1))
        && container.querySelector(".recharts-xAxis .recharts-cartesian-axis-tick")
    }
    for (let attempt = 0; attempt < 120 && !ready(); attempt += 1) await frame()
    if (!ready()) throw new Error("Unable to prepare the chart image.")
    const plot = container.firstElementChild
    const bounds = plot.getBoundingClientRect()
    const output = document.createElement("canvas")
    output.width = Math.round(bounds.width)
    output.height = Math.round(bounds.height)
    const context = output.getContext("2d")
    context.fillStyle = "white"
    context.fillRect(0, 0, output.width, output.height)
    // DOM order matches the on-screen layering: axes, PM change points, then the point canvas.
    const layers = [...plot.querySelectorAll("svg, canvas")].filter((element) => !element.parentElement.closest("svg"))
    for (const element of layers) {
      const rect = element.getBoundingClientRect()
      const source = element.tagName.toLowerCase() === "canvas" ? element : await svgImage(element, rect.width, rect.height)
      context.drawImage(source, rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height)
    }
    const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"))
    if (!blob || blob.size > MAX_CHART_IMAGE_BYTES) throw new Error("Unable to prepare the chart image.")
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error("Unable to prepare the chart image."))
      reader.readAsDataURL(blob)
    })
  } finally {
    root.unmount()
    container.remove()
  }
}
