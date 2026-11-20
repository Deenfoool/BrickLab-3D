const emblem = [
  'ooooooooo', 'oooxxxxoo', 'ooooooxoo', 'oxxxxoxoo', 'ooooxoxoo',
  'ooooxoooo', 'ooooxoooo', 'ooooooooo', 'ooooooooo',
]
const letters = {
  B: ['1110', '1001', '1001', '1110', '1001', '1001', '1110'],
  R: ['1110', '1001', '1001', '1110', '1010', '1001', '1001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  C: ['0111', '1000', '1000', '1000', '1000', '1000', '0111'],
  K: ['1001', '1010', '1100', '1100', '1010', '1001', '1001'],
  L: ['1000', '1000', '1000', '1000', '1000', '1000', '1111'],
  A: ['0110', '1001', '1001', '1111', '1001', '1001', '1001'],
  3: ['1110', '0001', '0001', '0110', '0001', '0001', '1110'],
  D: ['1110', '1001', '1001', '1001', '1001', '1001', '1110'],
}
const colors = { o: 'gold', x: 'black', 1: 'ivory', 2: 'gold' }

export function assembleStartupBrand(host) {
  const document = host.ownerDocument
  const layout = document.createElement('div')
  layout.className = 'startup-brick-brand'
  layout.setAttribute('role', 'img')
  layout.setAttribute('aria-label', 'BrickLab 3D')
  function component(rows, className, offset) {
    const layer = document.createElement('div')
    layer.className = className
    layer.style.setProperty('--columns', rows[0].length)
    layer.style.setProperty('--rows', rows.length)
    rows.forEach((row, y) => {
      for (const match of row.matchAll(/([ox12])\1{0,2}/g)) {
        const x = match.index
        const order = offset + .42 * x / rows[0].length + .18 * (1 - y / rows.length)
        const brick = document.createElement('i')
        brick.dataset.color = colors[match[1]]
        brick.style.setProperty('--x', x)
        brick.style.setProperty('--y', y)
        brick.style.setProperty('--studs', match[0].length)
        brick.style.setProperty('--arrival', order.toFixed(3))
        brick.style.setProperty('--side', (x + y) % 2 ? 1 : -1)
        layer.append(brick)
      }
    })
    layout.append(layer)
  }
  const wordmark = Array.from({ length: 7 }, (_, row) =>
    [...'BRICKLAB 3D'].map((letter, index) => {
      if (letter === ' ') return '0'
      return index >= 5 && index <= 7 ? letters[letter][row].replaceAll('1', '2') : letters[letter][row]
    }).join('0'))
  component(emblem, 'startup-brick-emblem', .02)
  component(wordmark, 'startup-brick-wordmark', .12)
  host.replaceChildren(layout)
}
