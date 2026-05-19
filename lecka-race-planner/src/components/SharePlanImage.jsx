/**
 * SharePlanImage.jsx
 *
 * Generates a 1080×1080 (square) or 1080×1920 (story) plan card PNG via
 * html2canvas (available as jspdf's optional dependency).
 *
 * Call generateShareImage(props, format) to get a data-URL string.
 */

async function loadHtml2canvas() {
  try {
    const mod = await import('html2canvas')
    return mod.default ?? mod
  } catch {
    // CDN fallback if bundled version is unavailable
    const mod = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js')
    return mod.default ?? mod
  }
}

function buildCardElement(props, format) {
  const {
    raceName = '',
    duration = '',
    conditions = '',
    effort = '',
    carbsPerHour = 0,
    sodiumPerHour = 0,
    fluidPerHour = 0,
    totalCarbs = 0,
    totalSodium = 0,
    products = [],
    planUrl = 'plan.getlecka.com',
    region = '',
  } = props

  const isStory  = format === 'story'
  const width    = 1080
  const height   = isStory ? 1920 : 1080
  const isIntl   = region === 'international'

  const el = document.createElement('div')
  el.style.cssText = `
    position: absolute; left: -9999px; top: 0;
    width: ${width}px; height: ${height}px;
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    background: #48C4B0;
    display: flex; flex-direction: column; align-items: center;
    justify-content: space-between;
    overflow: hidden;
  `

  const raceFontSize = raceName.length > 28 ? '44px' : '56px'
  const statNumSize  = isStory ? '96px' : '80px'
  const vGap         = isStory ? '48px' : '32px'

  // Show max 5 products as pills
  const displayProducts = products.slice(0, 5)
  const moreCount        = products.length - displayProducts.length

  const badgeStyle = `
    display:inline-block; background:rgba(0,0,0,0.2); color:white;
    border-radius:40px; padding:8px 20px; font-size:22px; margin:0 8px;
  `

  const pillStyle = `
    display:inline-block; background:white; color:#0F6E56;
    border-radius:40px; padding:8px 20px; font-size:18px; margin:4px;
  `

  el.innerHTML = `
    <!-- Top strip -->
    <div style="text-align:center; padding:${isStory ? '80px 40px 40px' : '56px 40px 24px'}; width:100%; box-sizing:border-box;">
      <div style="color:white; font-size:72px; font-weight:800; line-height:1; letter-spacing:-2px;">lecka</div>
      <div style="color:rgba(255,255,255,0.7); font-size:22px; margin-top:8px;">real food. real performance.</div>
    </div>

    <!-- Race name -->
    <div style="text-align:center; padding:0 60px; width:100%; box-sizing:border-box;">
      <div style="color:white; font-size:${raceFontSize}; font-weight:800; line-height:1.1; word-break:break-word;">${raceName || 'My Race Plan'}</div>
    </div>

    <!-- Badge row -->
    <div style="text-align:center; padding:0 40px; margin-top:${vGap};">
      ${duration   ? `<span style="${badgeStyle}">${duration}</span>`   : ''}
      ${conditions ? `<span style="${badgeStyle}">${conditions}</span>` : ''}
      ${effort     ? `<span style="${badgeStyle}">${effort}</span>`     : ''}
    </div>

    <!-- Stats block -->
    <div style="display:flex; width:100%; max-width:960px; margin-top:${vGap}; padding:0 40px; box-sizing:border-box; justify-content:space-around; align-items:flex-start;">
      <div style="text-align:center; flex:1;">
        <div style="color:white; font-size:${statNumSize}; font-weight:800; line-height:1;">${carbsPerHour}</div>
        <div style="color:rgba(255,255,255,0.6); font-size:22px;">g</div>
        <div style="color:rgba(255,255,255,0.6); font-size:16px; text-transform:uppercase; letter-spacing:2px; margin-top:4px;">CARBS/HR</div>
      </div>
      <div style="width:1px; background:rgba(255,255,255,0.3); align-self:stretch;"></div>
      <div style="text-align:center; flex:1;">
        <div style="color:white; font-size:${statNumSize}; font-weight:800; line-height:1;">${sodiumPerHour}</div>
        <div style="color:rgba(255,255,255,0.6); font-size:22px;">mg</div>
        <div style="color:rgba(255,255,255,0.6); font-size:16px; text-transform:uppercase; letter-spacing:2px; margin-top:4px;">SODIUM/HR</div>
      </div>
      <div style="width:1px; background:rgba(255,255,255,0.3); align-self:stretch;"></div>
      <div style="text-align:center; flex:1;">
        <div style="color:white; font-size:${statNumSize}; font-weight:800; line-height:1;">${fluidPerHour}</div>
        <div style="color:rgba(255,255,255,0.6); font-size:22px;">ml</div>
        <div style="color:rgba(255,255,255,0.6); font-size:16px; text-transform:uppercase; letter-spacing:2px; margin-top:4px;">FLUID/HR</div>
      </div>
    </div>

    <!-- Totals row -->
    <div style="text-align:center; color:rgba(255,255,255,0.7); font-size:20px; margin-top:${isStory ? '32px' : '16px'}; padding:0 40px;">
      ${totalCarbs}g carbs total · ${totalSodium}mg sodium total
    </div>

    <!-- Product pills -->
    <div style="text-align:center; padding:${isStory ? '32px 40px' : '20px 40px'}; width:100%; box-sizing:border-box;">
      ${isIntl
        ? `<span style="color:white; font-size:20px; font-style:italic;">Use with any real food gel</span>`
        : displayProducts.map(p => `<span style="${pillStyle}">${p.quantity}× ${p.name}</span>`).join('') +
          (moreCount > 0 ? `<span style="${pillStyle}">+${moreCount} more</span>` : '')
      }
    </div>

    <!-- Bottom strip -->
    <div style="background:rgba(0,0,0,0.25); width:100%; text-align:center; padding:${isStory ? '48px 40px' : '32px 40px'}; box-sizing:border-box;">
      <div style="color:white; font-size:28px; font-weight:800;">Build your free race plan</div>
      <div style="color:rgba(255,255,255,0.8); font-size:22px; margin-top:8px;">${planUrl}</div>
    </div>
  `

  return { el, width, height }
}

/**
 * Generates a share card PNG and returns the data-URL.
 * @param {object} props  — plan data props (see ShareModal for shape)
 * @param {'square'|'story'} format
 * @returns {Promise<string>}  data URL
 */
export async function generateShareImage(props, format = 'square') {
  const html2canvas = await loadHtml2canvas()
  const { el, width, height } = buildCardElement(props, format)
  document.body.appendChild(el)
  try {
    const canvas = await html2canvas(el, {
      scale:           2,
      useCORS:         true,
      backgroundColor: '#48C4B0',
      width,
      height,
      logging:         false,
    })
    return canvas.toDataURL('image/png')
  } finally {
    document.body.removeChild(el)
  }
}
