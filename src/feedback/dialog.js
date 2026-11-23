import { reportContacts, reportEnvironment, reportText, reportLinks, imageExtension, zipReport, maxScreenshots, maxAttachmentBytes } from './report.js?v=bug-report-v1'
const copy = {
  "ru": {
    "title": "Сообщить о баге",
    "intro": "Помоги сделать BrickLab лучше. Опиши проблему и приложи скриншот — так её будет проще повторить и исправить.",
    "close": "Закрыть",
    "area": "Где возникла проблема",
    "actual": "Что произошло",
    "actualHint": "Например: шестерня не соединяется с осью, хотя отверстия совпадают.",
    "steps": "Как повторить",
    "stepsHint": "1. Открыл набор…\n2. Добавил деталь…\n3. Нажал…",
    "expected": "Что должно было произойти (необязательно)",
    "reply": "Твоя почта или Telegram (необязательно)",
    "replyHint": "Если понадобится уточнение по багу",
    "screenshots": "Скриншоты",
    "add": "Добавить скриншоты",
    "imagesHint": "PNG, JPG или WebP. До 3 изображений, всего до 10 МБ. Можно вставить скриншот из буфера (Ctrl+V) или перетащить файл.",
    "remove": "Убрать",
    "console": "Консоль и ошибки приложения",
    "consoleHint": "Здесь собраны последние ошибки с момента открытия сайта. Можно дописать или вставить текст из консоли.",
    "help": "Как открыть консоль",
    "helpText": "Нажми F12 или Ctrl+Shift+J (на Mac: ⌘⌥J). Открой вкладку Console, скопируй красные ошибки и вставь сюда. Если ошибок нет — поле можно оставить пустым.",
    "include": "Приложить текст ошибок",
    "environment": "Также войдут версия приложения, браузер и размер окна. Перед отправкой проверь скриншоты и текст.",
    "prepare": "Подготовить отчёт",
    "preparing": "Собираем отчёт…",
    "ready": "Отчёт готов к отправке",
    "next": "1. Скачай ZIP с описанием и скриншотами.\n2. Открой письмо или Telegram.\n3. Прикрепи ZIP и отправь сообщение.",
    "download": "Скачать отчёт.zip",
    "email": "Открыть письмо",
    "telegram": "Открыть Telegram",
    "share": "Поделиться файлом…",
    "copy": "Скопировать описание",
    "copied": "Описание скопировано.",
    "clipboardError": "Не удалось скопировать. Выдели текст в превью отчёта и скопируй вручную.",
    "preview": "Посмотреть полный текст отчёта",
    "notice": "Сообщение отправишь ты в выбранном приложении. Сайт ничего не отправляет автоматически.",
    "invalidImage": "Не удалось прочитать изображение. Выбери PNG, JPG или WebP.",
    "tooMany": "Можно добавить не больше 3 скриншотов.",
    "tooLarge": "Общий размер скриншотов не должен превышать 10 МБ.",
    "failed": "Не удалось собрать ZIP. Попробуй ещё раз.",
    "shareFailed": "Не удалось поделиться файлом. Скачай ZIP и прикрепи его к сообщению.",
    "required": "Опиши, что произошло и как повторить проблему.",
    "emptyLogs": "Ошибок приложения пока нет.",
    "areas": [
      "Соединение деталей",
      "Кинематика и тест-драйв",
      "Инструкции",
      "Библиотека деталей",
      "Загрузка и сохранение",
      "Интерфейс",
      "Другое"
    ]
  },
  "en": {
    "title": "Report a bug",
    "intro": "Help improve BrickLab. Describe the problem and add a screenshot so it is easier to reproduce and fix.",
    "close": "Close",
    "area": "Where it happened",
    "actual": "What happened",
    "actualHint": "For example: the gear will not connect to the axle even though the holes line up.",
    "steps": "Steps to reproduce",
    "stepsHint": "1. Opened a set…\n2. Added a part…\n3. Clicked…",
    "expected": "Expected result (optional)",
    "reply": "Your email or Telegram (optional)",
    "replyHint": "In case the developer needs more details",
    "screenshots": "Screenshots",
    "add": "Add screenshots",
    "imagesHint": "PNG, JPG or WebP. Up to 3 images, 10 MB total. You can paste a screenshot (Ctrl+V) or drag a file here.",
    "remove": "Remove",
    "console": "Console and application errors",
    "consoleHint": "Recent errors from this session. You can edit them or paste more console output.",
    "help": "How to open the console",
    "helpText": "Press F12 or Ctrl+Shift+J (⌘⌥J on Mac). Open Console, copy the red errors and paste them here. Leave the field empty if there are no errors.",
    "include": "Include error text",
    "environment": "The report also includes the app version, browser and window size. Review the text and screenshots before sending.",
    "prepare": "Prepare report",
    "preparing": "Preparing report…",
    "ready": "Report ready to send",
    "next": "1. Download the ZIP with the description and screenshots.\n2. Open email or Telegram.\n3. Attach the ZIP and send the message.",
    "download": "Download report.zip",
    "email": "Open email",
    "telegram": "Open Telegram",
    "share": "Share file…",
    "copy": "Copy description",
    "copied": "Description copied.",
    "clipboardError": "Could not copy. Select the report preview text and copy it manually.",
    "preview": "Preview full report text",
    "notice": "You send the message in your chosen app. This site does not send anything automatically.",
    "invalidImage": "Could not read this image. Choose PNG, JPG or WebP.",
    "tooMany": "You can add up to 3 screenshots.",
    "tooLarge": "Screenshots must be no larger than 10 MB in total.",
    "failed": "Could not create the ZIP. Try again.",
    "shareFailed": "Could not share this file. Download the ZIP and attach it to your message.",
    "required": "Describe what happened and how to reproduce it.",
    "emptyLogs": "No application errors recorded yet.",
    "areas": [
      "Part connections",
      "Kinematics and test drive",
      "Instructions",
      "Parts library",
      "Loading and saving",
      "Interface",
      "Other"
    ]
  }
}
const markup = "<form class=\"bug-report-form\">\n<header class=\"bug-report-head\"><div><span class=\"bug-report-eyebrow\">BRICKLAB 3D · BETA</span><h2 id=\"bug-report-title\">{{title}}</h2></div><button class=\"bug-report-close\" type=\"button\" aria-label=\"{{close}}\">×</button></header>\n<p class=\"bug-report-intro\">{{intro}}</p>\n<label class=\"bug-report-field\"><span>{{area}}</span><select name=\"area\">{{options}}</select></label>\n<label class=\"bug-report-field\"><span>{{actual}} <b aria-hidden=\"true\">*</b></span><textarea name=\"actual\" required maxlength=\"6000\" rows=\"3\" placeholder=\"{{actualHint}}\"></textarea></label>\n<label class=\"bug-report-field\"><span>{{steps}} <b aria-hidden=\"true\">*</b></span><textarea name=\"steps\" required maxlength=\"6000\" rows=\"3\" placeholder=\"{{stepsHint}}\"></textarea></label>\n<label class=\"bug-report-field\"><span>{{expected}}</span><textarea name=\"expected\" maxlength=\"3000\" rows=\"2\"></textarea></label>\n<section class=\"bug-report-attachments\" aria-labelledby=\"bug-images-title\"><div class=\"bug-report-row\"><h3 id=\"bug-images-title\">{{screenshots}}</h3><button type=\"button\" class=\"secondary\" data-add>{{add}}</button></div><p class=\"bug-report-hint\">{{imagesHint}}</p><input data-files type=\"file\" accept=\"image/png,image/jpeg,image/webp\" multiple hidden><div class=\"bug-report-images\" data-images></div></section>\n<details class=\"bug-report-console\"><summary>{{console}}</summary><p class=\"bug-report-hint\">{{consoleHint}}</p><label class=\"bug-report-check\"><input type=\"checkbox\" name=\"include\" checked>{{include}}</label><textarea name=\"logs\" rows=\"5\" maxlength=\"100000\" aria-label=\"{{console}}\" spellcheck=\"false\" placeholder=\"{{emptyLogs}}\"></textarea><details class=\"bug-report-help\"><summary>{{help}}</summary><p>{{helpText}}</p></details></details>\n<label class=\"bug-report-field\"><span>{{reply}}</span><input name=\"reply\" type=\"text\" maxlength=\"180\" placeholder=\"{{replyHint}}\"></label>\n<p class=\"bug-report-hint\">{{environment}}</p><button type=\"submit\" class=\"primary bug-report-prepare\">{{prepare}}</button><p class=\"bug-report-status\" data-status role=\"status\" aria-live=\"polite\"></p>\n<section class=\"bug-report-ready\" data-ready hidden aria-labelledby=\"bug-ready-title\"><h3 id=\"bug-ready-title\">{{ready}}</h3><p class=\"bug-report-next\">{{next}}</p><a class=\"primary\" data-download>{{download}}</a><div class=\"bug-report-channels\"><a class=\"secondary\" data-mail>{{email}}</a><a class=\"secondary\" data-telegram target=\"_blank\" rel=\"noopener noreferrer\">{{telegram}}</a><button class=\"secondary\" type=\"button\" data-share hidden>{{share}}</button><button class=\"secondary\" type=\"button\" data-copy>{{copy}}</button></div><p class=\"bug-report-recipients\"></p><details><summary>{{preview}}</summary><pre data-preview tabindex=\"0\"></pre></details><p class=\"bug-report-hint\">{{notice}}</p></section>\n</form>"

export function mountBugReport({ getLanguage, diagnostics, version = 'bug-report-v1' }) {
  const dialog = document.createElement('dialog')
  dialog.id = 'bug-report-dialog'; dialog.className = 'bug-report'; dialog.setAttribute('aria-labelledby', 'bug-report-title')
  document.body.append(dialog)
  let language, fields = {}, images = [], reportURL, prepared, text = '', operation = 0, adding = Promise.resolve(), busy = false, lastAutoLogs = ''
  const t = () => copy[language]
  const find = selector => dialog.querySelector(selector)
  function invalidate() {
    operation++
    if (reportURL) URL.revokeObjectURL(reportURL)
    reportURL = null; prepared = null
    if (find('[data-ready]')) find('[data-ready]').hidden = true
    if (find('[data-status]')) find('[data-status]').textContent = ''
  }
  function values() {
    const data = Object.fromEntries(new FormData(find('form')))
    return { ...data, logs: find('[name=include]').checked ? data.logs : '' }
  }
  function remember() {
    fields = Object.fromEntries(new FormData(find('form')))
    fields.include = find('[name=include]').checked
  }
  function status(message) { find('[data-status]').textContent = message }
  function updateImages() {
    const list = find('[data-images]'); list.replaceChildren()
    images.forEach((image, i) => {
      const figure = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption'), remove = document.createElement('button')
      img.src = image.url; img.alt = t().screenshots + ' ' + (i + 1)
      caption.textContent = (i + 1) + ' · ' + (image.file.size / 1024 / 1024).toFixed(1) + ' MB'
      remove.type = 'button'; remove.textContent = t().remove; remove.setAttribute('aria-label', t().remove + ': ' + img.alt)
      remove.addEventListener('click', () => {
        URL.revokeObjectURL(image.url); images = images.filter(item => item !== image); invalidate(); updateImages()
      })
      figure.append(img, caption, remove); list.append(figure)
    })
  }
  function addFiles(files) {
    const selected = Array.from(files)
    adding = adding.then(async () => {
      busy = true; find('[type=submit]').disabled = true
      let message = ''
      try {
        for (const file of selected) {
          if (images.length >= maxScreenshots) { message = t().tooMany; break }
          if (!file.size || images.reduce((sum, i) => sum + i.file.size, 0) + file.size > maxAttachmentBytes) { message = t().tooLarge; continue }
          const extension = await imageExtension(file)
          if (!extension) { message = t().invalidImage; continue }
          const url = URL.createObjectURL(file), preview = new Image()
          try {
            preview.src = url; await preview.decode()
            if (preview.naturalWidth * preview.naturalHeight > 40000000) throw Error('Image too large to preview')
            images.push({ file, extension, url }); invalidate(); updateImages()
          } catch { URL.revokeObjectURL(url); message = t().invalidImage }
        }
        status(message)
      } finally { busy = false; find('[type=submit]').disabled = false }
    }).catch(() => { busy = false; find('[type=submit]').disabled = false; status(t().invalidImage) })
  }
  function render() {
    const c = t()
    // Only fixed translations enter HTML; user input is always assigned via value/textContent.
    dialog.innerHTML = markup.replace(/\{\{(\w+)\}\}/g, (_, key) => key === 'options' ? c.areas.map(area => '<option>' + area + '</option>').join('') : c[key])
    for (const [name, value] of Object.entries(fields)) {
      const input = find('[name="' + name + '"]')
      if (!input) continue
      if (input.type === 'checkbox') input.checked = Boolean(value)
      else input.value = value
    }
    find('.bug-report-close').addEventListener('click', () => dialog.close())
    const drop = find('.bug-report-attachments')
    drop.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); drop.classList.add('is-dragging') } })
    drop.addEventListener('dragleave', event => { if (!drop.contains(event.relatedTarget)) drop.classList.remove('is-dragging') })
    drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('is-dragging'); addFiles(event.dataTransfer?.files ?? []) })
    find('[data-add]').addEventListener('click', () => find('[data-files]').click())
    find('[data-files]').addEventListener('change', event => { addFiles(event.target.files); event.target.value = '' })
    find('form').addEventListener('input', () => { invalidate(); remember() })
    find('form').addEventListener('change', () => { invalidate(); remember() })
    find('form').addEventListener('submit', prepare)
    find('[data-copy]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); status(t().copied) }
      catch { find('[data-ready] details').open = true; status(t().clipboardError) }
    })
    find('[data-share]').addEventListener('click', async () => {
      if (!prepared) return
      try { await navigator.share({ files: [prepared], title: 'BrickLab 3D bug report' }) }
      catch (error) { if (error.name !== 'AbortError') status(t().shareFailed) }
    })
    updateImages()
  }
  async function prepare(event) {
    event.preventDefault()
    if (busy) return
    if (!find('form').reportValidity()) return
    if (!values().actual.trim() || !values().steps.trim()) { status(t().required); return }
    invalidate(); const id = operation; const button = find('[type=submit]')
    button.disabled = true; button.textContent = t().preparing
    try {
      remember()
      const entries = await Promise.all(images.map(async (image, index) => ({ name: 'screenshot-' + (index + 1) + '.' + image.extension, bytes: new Uint8Array(await image.file.arrayBuffer()) })))
      const environment = reportEnvironment(window, version)
      const data = values(); text = reportText(data, environment, entries, language)
      const encoder = new TextEncoder()
      const blob = zipReport([{ name: 'report.txt', bytes: encoder.encode(text) }, { name: 'environment.json', bytes: encoder.encode(JSON.stringify(environment, null, 2)) }, ...entries])
      if (id !== operation) return
      const filename = 'bricklab-bug-' + environment.capturedAt.replace(/[:.]/g, '-') + '.zip'
      reportURL = URL.createObjectURL(blob); prepared = new File([blob], filename, { type: 'application/zip' })
      const download = find('[data-download]'); download.href = reportURL; download.download = filename
      const links = reportLinks(data, language)
      find('[data-mail]').href = links.mail; find('[data-telegram]').href = links.telegram
      find('[data-preview]').textContent = text
      find('.bug-report-recipients').textContent = reportContacts.email + ' · @' + reportContacts.telegram
      find('[data-ready]').hidden = false
      try { find('[data-share]').hidden = !navigator.canShare?.({ files: [prepared] }) } catch { find('[data-share]').hidden = true }
      find('[data-download]').focus(); find('[data-ready]').scrollIntoView({ block: 'nearest', behavior: 'auto' })
    } catch { status(t().failed) }
    finally { button.disabled = busy; button.textContent = t().prepare }
  }
  dialog.addEventListener('paste', event => {
    const files = Array.from(event.clipboardData?.items ?? []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean)
    if (files.length) { event.preventDefault(); addFiles(files) }
  })
  dialog.addEventListener('close', () => { remember() })
  window.addEventListener('pagehide', event => {
    if (event.persisted) return
    if (reportURL) URL.revokeObjectURL(reportURL)
    for (const image of images) URL.revokeObjectURL(image.url)
  })
  return {
    open() {
      if (dialog.open) return
      const next = getLanguage() === 'en' ? 'en' : 'ru'
      if (language !== next) {
        if (language) remember()
        const index = language ? copy[language].areas.indexOf(fields.area) : -1
        language = next
        if (index >= 0) fields.area = copy[next].areas[index]
        invalidate(); render()
      }
      const log = find('[name=logs]')
      const latest = diagnostics?.snapshot() || ''
      if (!log.value || log.value === lastAutoLogs) { log.value = latest; lastAutoLogs = latest; invalidate() }
      dialog.showModal(); find('[name=actual]').focus()
    },
  }
}
