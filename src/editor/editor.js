import { loadPartIndex, enrichInventory, normalizeDocumentDesigns } from '../catalog/part-resolver.js?v=catalog-engine-1'
import { instructionState, mountInstructions, prepareInstructionPage, waitForInstruction } from '../sets/instructions.js?v=instruction-artwork-v5'
import { createInstructionPdfReader } from '../sets/instruction-pdf.js?v=instruction-artwork-v5'
import { mountSetPalette } from '../sets/palette.js?v=catalog-engine-1'
import { inspectSetPart } from '../sets/inspect.js'
import { node, control } from '../sets/catalog.js'
import { mountCablePanel } from './cable-panel.js'
import { mountFloatingPanels } from './floating-panels.js?v=workspace-21'
import { bindPartContextInput } from './part-context-input.js?v=context-pages-1'
import { mountWorkspace } from './workspace.js?v=menu-studio-2'
import { createEditorAudio } from './audio.js?v=editor-sound'
import { mountMotorPanel } from './motor-panel.js'
import { Plane, Quaternion, Vector3 } from 'three'
import { hasConnectors, portsFor } from '../mechanics/catalog.js?v=volvo-spur-gears'
import { baseRotation, mirrorPose, samePose, worldPort } from './placement.js?v=torque-clutch'
import { shiftSelector, linkedSelector, recoverSelectorLinks, connectAligned, connectPlaced, createAssembly, assemblyJoints, gearPoses, hingeMotion, hingePoses, loadParts, raisedPose, rotationMotion, rotationPoses, snapGrid } from './model.js?v=volvo-spur-gears'
import { axleEnds, axleOptions, resizeAxle } from './axle-length.js?v=belt-drive'
import { nearestDetent } from '../mechanics/axial.js?v=torque-clutch'
import { nearbyConnections, translationSnaps } from './snap.js?v=volvo-spur-gears'
import { loadCoreModels, loadPartModel, parts, sections } from './parts.js?v=system-complete'
import { mountLibrary } from './library.js?v=catalog-engine-1'
import { createScene } from './scene.js?v=menu-studio-2'
import {mountTransmissionMap,transmissionMap,transmissionCodes} from './transmission-map.js?v=menu-studio-1'
import {mountMotorBench} from './motor-bench-panel.js'
import {mountCollaboration} from './collaboration-client.js?v=live-polish-1'
import {sharedDelta} from './shared-document.js'
import {mountDriveEstimate} from './drive-estimate-panel.js?v=feedback-2'
import {engineeringReport,downloadEngineeringReport} from './engineering-report.js'
import { mountScenePartsPanel } from './scene-parts-panel.js?v=menu-studio-2'
import { hiddenSceneParts, moveToSceneGroup, readSceneLayers } from './scene-layers.js?v=menu-studio-1'
import { driveTitle, mountDrivePanel } from './drive-panel.js?v=volvo-spur-gears'
import { mountBeltPanel } from './belt-panel.js?v=belt-drive'
import { mountTrackPanel, trackLabels } from './track-panel.js?v=level-treads'
import { upgradeInlineEngineFan } from './inline-engine.js'
import { beltTravel, promoteLegacyBelts } from '../mechanics/belts.js?v=belt-drive'
import { componentBundle, expandComponents } from './components.js?v=belt-drive'
import { editorLabels } from './labels.js?v=torque-clutch'
import { readPreference, writePreference } from '../menu/preferences.js?v=full-settings'
import { mountTutorial, showEditorTip } from './tutorial.js?v=audit-resume-1'

const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const rotationStep = Math.PI / 4
const freeKeyboardStep = Math.PI / 36
const modes = ['build', 'paint', 'kinematics', 'testDrive']
const buildTools = ['select', 'box', 'move', 'rotate', 'length', 'belt', 'track']
const paintColors = ['#c91a09', '#0055bf', '#f2cd37', '#237841', '#f4f4f4', '#a0a5a9', '#1b2a34']
const heldTurns = { ArrowUp: [X, -1], ArrowDown: [X, 1], ArrowLeft: [Y, -1], ArrowRight: [Y, 1] }
const steps = { ArrowUp: [0, 0, -1], ArrowDown: [0, 0, 1], ArrowLeft: [-1, 0, 0], ArrowRight: [1, 0, 0] }
const connectionRecord = ({ shaft, socket, fit }) => ({ shaft, socket, placement: fit.placement })
const connectionKey = ({ shaft, socket }) => JSON.stringify([shaft.part, shaft.port, socket.part, socket.port])
function hasNewConnection(before, after) {
  const previous = new Set(before.map(connectionKey))
  return after.some(link => !previous.has(connectionKey(link)))
}
const simulating = mode => mode === 'testDrive'
const onGrid = value => Math.round(value / snapGrid) * snapGrid
let clipboard

export async function mountEditor(root, { document, projectId, language, save, download, publish, signal, reportLoad, collaboration, onJoinCollaboration, projectActions }) {
  await loadPartIndex()
  if (signal.aborted) return
  const source = upgradeInlineEngineFan(promoteLegacyBelts(expandComponents(normalizeDocumentDesigns(document, parts), parts)))
  let buildingSet = instructionState(source.buildingSet)
  const resolvedInventory = buildingSet ? enrichInventory(buildingSet.set.inventory, parts, { signal }) : null
  const pdf = buildingSet ? createInstructionPdfReader() : undefined
  if (pdf) signal.addEventListener('abort', pdf.close, { once: true })
  const firstPage = prepareInstructionPage(buildingSet, signal, pdf)
  const instructionReady = reportLoad && waitForInstruction(firstPage, signal).then(ready => {
    if (!signal.aborted) reportLoad('instruction', ready)
  })
  const t = editorLabels[language]
  const trackText = trackLabels[language]
  const models = new Map()
  const requests = new Map()

  function prepareModel(part) {
    if (models.has(part.design)) return Promise.resolve()
    if (!requests.has(part.design)) {
      const request = (part.pack ? loadPartModel(part).then(model => models.set(part.design, model))
        : loadCoreModels().then(core => {
          for (const [design, model] of core) models.set(design, model)
        }))
        .finally(() => requests.delete(part.design))
      requests.set(part.design, request)
    }
    return requests.get(part.design)
  }

  const designs = [...new Set(source.parts.map(part => String(part?.design ?? '')))].filter(design => parts[design])
  const failedModels = new Set()
  // Bound simultaneous model decoding when opening a large existing build.
  for (let index = 0; index < designs.length && !signal.aborted; index += 4) {
    const entries = designs.slice(index, index + 4)
    const results = await Promise.allSettled(entries.map(design => prepareModel(parts[design])))
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        failedModels.add(entries[i])
        console.error(result.reason)
      }
    })
  }
  const inventory = await resolvedInventory
  if (signal.aborted) return
  root.innerHTML = `
    <header class="editor-bar">
      <a class="editor-back" href="#projects" aria-label="${t.home}"><img src="./assets/bricklab.svg" alt="" width="31" height="31"><span>${t.home}</span></a>
      <input class="editor-name" data-el="name" aria-label="${t.name}" maxlength="120">
      <div class="editor-modes">
        <button data-el="build" type="button">${t.build}</button>
        <button data-el="paint" type="button">${t.paint}</button>
        <button data-el="kinematics" type="button">${t.kinematics}</button>
        <button data-el="testDrive" type="button">${driveTitle(language)}</button>
      </div>
      <div class="editor-actions">
        <button data-el="editCable" type="button" aria-pressed="false">${language === 'ru' ? 'Укладка' : 'Route cables'}</button>
        <button data-el="wires" type="button" aria-pressed="true">${language === 'ru' ? 'Провода' : 'Wires'}</button>
        <button data-el="sound" class="editor-square editor-sound" type="button" aria-label="${t.sound}">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z"/><path class="sound-waves" d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/><path class="sound-muted" d="m16 9 5 6m0-6-5 6"/></svg>
        </button>
        <button data-el="undo" class="editor-square" type="button" title="${t.undo}" aria-label="${t.undo}">↶</button>
        <button data-el="redo" class="editor-square" type="button" title="${t.redo}" aria-label="${t.redo}">↷</button>
        <button data-el="export" type="button">${t.download}</button>
        <button data-el="save" class="editor-primary" type="button">${t.save}</button>
        <button data-el="publish" class="editor-publish" type="button" ${typeof publish==='function'?'':'hidden'}>${language==='ru'?'Опубликовать':'Publish'}</button>
      </div>
    </header>
    <div class="editor-workspace">
      <section class="editor-viewport" data-el="viewport">
        <div class="editor-selection-frame" data-el="selectionFrame" aria-hidden="true" hidden></div>
        <div class="editor-axle-handles" data-el="axleHandles" hidden>
          ${[0, 1].map(end => `<button type="button" class="editor-axle-end" data-end="${end}" aria-label="${t.axleEnd(end + 1)}" title="${t.axleEnd(end + 1)}">↔</button>`).join('')}
        </div>
        <div data-el="empty" class="editor-empty">${t.empty}</div>
        <div class="editor-coordinates" aria-hidden="true"><span>X</span><span>Y</span><span>Z</span></div>
      </section>
      <aside class="editor-test-drive cable-route-panel" data-el="cablePanel" hidden></aside>
      <aside class="editor-test-drive" data-el="drivePanel" hidden></aside>
      <div class="editor-load-notice" data-el="loadNotice" hidden>
        <span data-el="loadNoticeText" role="status"></span>
        <button type="button" data-el="dismissLoadNotice" aria-label="${t.dismissNotice}" title="${t.dismissNotice}">×</button>
      </div>
      <div class="editor-overlay">
        <div class="editor-panel-layer" data-el="panelLayer">
          <aside class="editor-panel editor-catalog" data-panel="library" aria-labelledby="editor-library-heading">
            <header class="editor-panel-header">
              <h2 id="editor-library-heading" data-panel-grip tabindex="0" title="${t.movePanel}">${t.library}</h2>
              <button type="button" data-panel-toggle aria-controls="editor-library-body"></button>
            </header>
            <div class="editor-panel-body editor-library-body" id="editor-library-body">
              <div class="editor-library-controls" data-library-controls>
                <input type="search" aria-label="${t.search}" placeholder="${t.search}">
              </div>
              <div class="editor-library-scroll" data-library-scroll>
                <div class="editor-parts" data-library-cards></div>
              </div>
            </div>
          </aside>
          <aside class="editor-panel editor-inspector" data-panel="inspector" aria-labelledby="editor-inspector-heading">
            <header class="editor-panel-header">
              <h2 id="editor-inspector-heading" data-panel-grip tabindex="0" title="${t.movePanel}">${t.info}</h2>
              <button type="button" data-panel-toggle aria-controls="editor-inspector-body"></button>
            </header>
            <div class="editor-panel-body" id="editor-inspector-body">
              <p data-el="selection"></p>
              <div data-el="selector" hidden>${language === 'ru' ? 'Положение муфты' : 'Driving ring position'}
                <button data-shift="-1">◀</button><button data-shift="0">N</button><button data-shift="1">▶</button>
              </div>
              <div class="editor-part-actions" data-el="partActions" hidden>
                <label>${t.color}<input type="color" data-el="color"></label>
                <button type="button" data-el="copy">${t.copy}</button>
                <button type="button" data-el="duplicate">${t.duplicate}</button>
                <button type="button" data-el="remove" class="editor-danger">${t.delete}</button>
              </div>
              <button type="button" data-el="paste" hidden>${t.paste}</button>
              <div data-el="insertion" class="editor-insertion" hidden>
                <span>${t.depth}</span><div>
                  <button type="button" data-el="shallower" aria-label="${t.out}">−</button>
                  <output data-el="depth">0</output>
                  <button type="button" data-el="deeper" aria-label="${t.in}">+</button>
                </div>
                <small>${t.side}</small>
              </div>
              <button type="button" data-el="stopRunningMotor" hidden>${language === 'ru' ? 'Остановить мотор' : 'Stop motor'}</button>
              <section data-el="motorPanel" class="editor-motor-panel" hidden></section>
              <div data-el="motion" class="editor-motion" hidden>
                <label><span data-el="motionLabel">${t.drive}</span><input data-el="angle" type="range" min="-1080" max="1080" step="1" value="0"></label>
                <output data-el="degrees">0°</output>
                <label data-el="speedControl"><span>${language==='ru'?'Скорость воспроизведения':'Playback speed'} <output data-el="speedValue">1×</output></span><input data-el="motionSpeed" type="range" min="0.1" max="5" step="0.1" value="1"></label>
                <select data-el="motionAxis" aria-label="${t.motionAxis}" hidden>
                  <option value="0">X</option><option value="1" selected>Y</option><option value="2">Z</option>
                </select>
                <button type="button" data-el="play">${t.play}</button>
                <button type="button" data-el="applyHinge" hidden>${t.applyHinge}</button>
              </div>
              <section class="editor-transmission-map" data-el="transmissionMap" hidden></section>
              <section class="editor-drive-estimate" data-el="driveEstimate" hidden></section>
              <section class="editor-drive-estimate" data-el="motorBench" hidden></section>
              <button data-el="engineeringReport" type="button" hidden>${language==='ru'?'Скачать инженерный отчёт':'Download engineering report'}</button>
              <section class="editor-diagnostic-issues" data-el="diagnosticIssues" hidden></section>
              <button type="button" data-el="clutchTest" hidden></button>
              <p role="status" data-el="clutchStatus" hidden></p>
              <section class="editor-belt-panel" data-el="beltPanel"  aria-label="${t.beltAdd}" hidden></section>
              <section class="editor-belt-panel editor-track-panel" data-el="trackPanel" aria-label="${trackText.name}" hidden></section>
              <p class="editor-links" data-el="links"></p>
            </div>
          </aside>
          <aside class="editor-panel editor-scene-parts" data-panel="scene-parts" aria-labelledby="editor-scene-parts-heading">
            <header class="editor-panel-header">
              <h2 id="editor-scene-parts-heading" data-panel-grip tabindex="0" title="${t.movePanel}">${t.sceneParts}</h2>
              <button type="button" data-panel-toggle aria-controls="editor-scene-parts-body"></button>
            </header>
            <div class="editor-panel-body editor-scene-parts-body" id="editor-scene-parts-body" data-el="sceneParts">
              <p class="editor-scene-count" data-el="count"></p>
            </div>
          </aside>
        </div>
        <div class="editor-dock">
          <p class="editor-hint" data-el="hint" role="status"></p>
          <div class="editor-viewport-tools" data-el="buildTools" role="group" aria-label="${t.buildTools}">
            <button type="button" data-el="selectTool" title="${t.select} (V)" aria-label="${t.select}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 3 13 10-6 1-3 6z"/></svg></button>
            <button type="button" data-el="boxTool" title="${t.boxSelect} (B / И)" aria-label="${t.boxSelect}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/></svg></button>
            <button type="button" data-el="moveTool" title="${t.move} (G / П)" aria-label="${t.move}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M9 6l3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/></svg></button>
            <button type="button" data-el="rotateTool" title="${t.rotate} (R / К)" aria-label="${t.rotate}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 1-3-6m-2 3h5V3"/></svg></button>
            <select data-el="pivotMode" aria-label="${language === 'ru' ? 'Центр вращения' : 'Rotation pivot'}"><option value="center">${language === 'ru' ? 'Центр выделения' : 'Selection center'}</option><option value="joint">${language === 'ru' ? 'Ось соединения' : 'Joint axis'}</option></select>
            <button type="button" data-el="rotationSnap" aria-label="${t.rotationSnap}" aria-pressed="true">45°</button>
            <button type="button" data-el="lengthTool" title="${t.length} (S / Ы)" aria-label="${t.length}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M7 8l-4 4 4 4m10-8 4 4-4 4M12 7v10"/></svg></button>
            <details class="editor-connection-tools" data-el="connectionTools">
              <summary title="${t.joints}" aria-label="${t.joints}">
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m10 13 4-4m-6 6-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m2 2a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-1 1" transform="translate(0 3)"/></svg>
                <svg class="editor-dock-chevron icon" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 7 3-3 3 3"/></svg>
              </summary>
              <div class="editor-connection-menu">
                <button type="button" data-el="beltTool" title="${t.beltAdd}">${t.belt}</button>
                <button type="button" data-el="trackTool" title="${trackText.name}">${trackText.tool}</button>
              </div>
            </details>
            <button type="button" data-el="snap" title="${t.snap}" aria-label="${t.snap}" aria-pressed="true"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h5v9a3 3 0 0 0 6 0V4h5v9a8 8 0 0 1-16 0zM4 8h5m6 0h5"/></svg></button>
            <button type="button" data-el="groupSelection" title="${t.createGroup}" hidden>${t.groupSelection}</button>
            <button type="button" class="editor-dock-snap-all" data-el="snapAll" title="${t.snapAllTitle}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6m-8 10 2 2 7-7"/></svg>${t.snapAll}</button>
            <button type="button" data-el="frame" title="${t.reset}" aria-label="${t.reset}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5m0 6v5h-5m-6 0H4v-5m5-3h6m-3-3v6"/></svg></button>
          </div>
          <div class="editor-paint-tools" data-el="paintTools" role="group" aria-label="${t.paint}" hidden>
            <div class="editor-paint-swatches">
              ${paintColors.map(color => {
                const label = `${t.color} ${color.toUpperCase()}`
                return `<button type="button" data-paint="${color}" style="--paint-swatch:${color}" title="${label}" aria-label="${label}" aria-pressed="${color === paintColors[0]}"></button>`
              }).join('')}
            </div>
            <label class="editor-paint-custom"><input type="color" data-el="paintColor" value="${paintColors[0]}">${t.paintCustom}</label>
            <button type="button" data-el="paintFrame">${t.reset}</button>
          </div>
        </div>
      </div>
    </div>`
  const menuIcon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`
  root.insertAdjacentHTML('beforeend', `<div class="part-context" data-el="partContext" hidden>
    <button type="button" data-action="mirror" aria-expanded="false">${menuIcon('M12 2v3m0 3v3m0 3v3m0 3v2M3 18l6-12v12zM21 18L15 6v12z')}${language === 'ru' ? 'Отразить' : 'Mirror'}<span class="context-chevron" aria-hidden="true">›</span></button>
    <div data-el="mirrorAxes" hidden>${['X','Y','Z'].map((axis, i) => `<button type="button" data-axis="${i}">${axis}</button>`).join('')}</div>
    <button type="button" data-action="copy">${menuIcon('M9 9h11v12H9zM15 6V3H3v12h3')}${t.duplicate}</button>
    <button type="button" data-action="delete">${menuIcon('M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7')}${t.remove}</button>
  </div>`)
  const el = name => root.querySelector(`[data-el="${name}"]`)
  const on = (target, event, callback, capture = false) => target.addEventListener(event, callback, { signal, capture })
  const hint = el('hint')
  const selectionFrame = el('selectionFrame')
  const paintColor = el('paintColor')
  const paintSwatches = [...el('paintTools').querySelectorAll('[data-paint]')]
  let scene
  let tutorial = null
  try {
    scene = createScene(el('viewport'), models)
  } catch (error) {
    root.replaceChildren()
    throw error
  }
  let findSetPart
  let setPalette
  mountInstructions(el('panelLayer'), buildingSet, { language, signal, firstPage, pdf,
    change(value) { buildingSet = value; persist() },
    findPart: (...ids) => findSetPart?.(...ids),
    describePart: (partNum, colorId) => setPalette?.describe(partNum, colorId),
  })
  mountFloatingPanels(el('panelLayer'), t, signal)
  let collaborationUI
  let customInstructions=source.customInstructions
  const workspaceUI = mountWorkspace(root, { language, scene, signal,
    grid: readPreference('grid') !== 'off', axes: readPreference('axes') !== 'off', changePreference: writePreference,
    commands:()=>commandList(), invokeCommand:id=>invokeCommand(id), openCommands:()=>openCommands(),
    hideSelection: () => setPartsHidden(selectionIds(), true),
    openCollaboration:()=>collaborationUI?.open(),
    openPhotoStudio:async()=>{if(dragActive()||moving||pendingPart)return;stopAnimation();releaseMotor();try{const {openPhotoStudio}=await import('./photo-studio.js');if(!signal.aborted)openPhotoStudio({document:currentDocument(),models,hidden,language,signal})}catch{setMessage(language==='ru'?'Не удалось открыть фотостудию: проверь загрузку деталей и WebGL.':'Could not open Photo Studio: check geometry and WebGL.');render()}},
  })
  const visibleParts = loadParts(source, models)
  const shown = new Set(visibleParts.map(part => part.id))
  const hiddenParts = source.parts.filter(part => !models.has(String(part?.design ?? '')))
  const unknownPartCount = hiddenParts.filter(part => !parts[String(part?.design ?? '')]).length
  const hiddenGears = Array.isArray(source.gears) ? source.gears.filter(gear => !shown.has(gear?.part)) : []
  const hiddenIds = new Set(hiddenParts.map(part => part?.id).filter(id => typeof id === 'string' && !shown.has(id)))
  const unknownLinks = source.connections.filter(link => hiddenIds.has(link?.shaft?.part) || hiddenIds.has(link?.socket?.part))
  const beltRecords = Array.isArray(source.belts) ? source.belts : []
  const hasHiddenEndpoint = record => hiddenIds.has(record?.a?.part) || hiddenIds.has(record?.b?.part)
  const hiddenBelts = beltRecords.filter(hasHiddenEndpoint)
  const layers = readSceneLayers(source.sceneLayers, new Set([...shown, ...hiddenIds]))
  let state = { parts: visibleParts, layers, belts: beltRecords.filter(record => !hasHiddenEndpoint(record)),
    links: source.connections.filter(link => shown.has(link?.shaft?.part) && shown.has(link?.socket?.part)) }
  let assembly = createAssembly(state.parts, state.links, { belts: state.belts })
  state.belts = assembly.belts.map(({ record }) => record)
  const discardedBelts = beltRecords.length - state.belts.length - hiddenBelts.length
  const discardedLinks = source.connections.length - assembly.connections.length - unknownLinks.length
  const connectionKey=link=>JSON.stringify([link?.shaft?.part,link?.shaft?.port,link?.socket?.part,link?.socket?.port])
  const acceptedKeys=new Map(),unavailableLinks=new Set(unknownLinks)
  for(const link of assembly.connections){const k=connectionKey(link);acceptedKeys.set(k,(acceptedKeys.get(k)??0)+1)}
  const initialIssues=[]
  for(const link of source.connections){
    if(unavailableLinks.has(link))continue
    const k=connectionKey(link),count=acceptedKeys.get(k)??0
    if(count)acceptedKeys.set(k,count-1)
    else initialIssues.push({kind:'connection',a:link?.shaft?.part,b:link?.socket?.part,portA:link?.shaft?.port,portB:link?.socket?.port})
  }
  const acceptedBeltIds=new Map()
  for(const record of state.belts)acceptedBeltIds.set(record.id,(acceptedBeltIds.get(record.id)??0)+1)
  for(const record of beltRecords){
    if(hasHiddenEndpoint(record))continue
    const count=acceptedBeltIds.get(record?.id)??0
    if(count)acceptedBeltIds.set(record.id,count-1)
    else initialIssues.push({kind:'belt',a:record?.a?.part,b:record?.b?.part,portA:record?.a?.groove,portB:record?.b?.groove})
  }
  const loadNotice = [
    failedModels.size ? t.modelsUnavailable(failedModels.size) : '',
    discardedLinks ? t.discarded(discardedLinks) : '',
    discardedBelts ? t.beltsDiscarded(discardedBelts) : '',
    unknownPartCount ? t.unknown(unknownPartCount) : '',
  ].filter(Boolean).join(' · ')
  if (loadNotice) {
    el('loadNotice').hidden = false
    el('loadNoticeText').textContent = loadNotice
    on(el('dismissLoadNotice'), 'click', () => {
      el('loadNotice').hidden = true
      scene.canvas.focus({ preventScroll: true })
    })
  }
  const recovered = recoverSelectorLinks(state.parts, assembly)
  state.parts = recovered.parts
  assembly = recovered.assembly
  state.links = assembly.connections.map(connectionRecord)
  let mode = 'build'
  let selected
  let selectorLinkage
  let isolation
  let hidden = hiddenSceneParts(layers, visibleParts)
  let moving
  let placingCopy = false
  let pastedGroup
  let jointMode = false
  let chosenJoint, activeJoint
  let tool = 'move'
  const additional = new Set()
  let resize
  let transform
  let gizmoSnap
  let gizmoRaw
  let snapEnabled = readPreference('snap') !== 'off'
  let steppedRotation = readPreference('rotationSnap') !== 'off'
  let grab
  let gizmoPart
  let ignoreGizmoClick = false
  let movesExisting = false
  let placementAssembly
  let pointer
  let candidate
  let pose
  let depth = 0
  let roll = 0
  let angle = 0
  let motionSpeed = 1
  let lastPreview = 0
  let frame
  let clutchTest
  let runningMotor
  let transmission
  let mappedParts=new Map(),lastMotionPoses=[],lastMapUpdate=0,driveReport=null,motorBenchReport=null
  let hinge
  let pointerDown
  let boxSelection
  let directDrag
  let drag
  let links = assembly.connections
  let message = ''
  let messageTimer
  let snappingScene = false
  let pendingPart
  const mapUI=mountTransmissionMap(el('transmissionMap'),{language,signal,onChange:()=>{refreshTransmissionMap();updateHighlights()},onFocus:ids=>scene.focus(ids)})
  const estimateUI=mountDriveEstimate(el('driveEstimate'),{language,signal,onFocus:ids=>scene.focus(ids),onReport:value=>{driveReport=value}})
  const benchUI=mountMotorBench(el('motorBench'),{language,signal,onReport:value=>{motorBenchReport=value},onRun:async(motorId,seconds,request,onProgress)=>{const {runMotorBench}=await import('./motor-bench.js');request.throwIfAborted();return runMotorBench({parts:state.parts.filter(p=>!hidden.has(p.id)),links:state.links,models,motorId,seconds,signal:request,onProgress})}})
  on(el('engineeringReport'),'click',()=>downloadEngineeringReport(engineeringReport({name:currentDocument().name,driver:selected,parts:state.parts.length,connections:links.length,belts:state.belts.length,hidden:hidden.size,importIssues:initialIssues,motion:transmission,drive:driveReport,motorBench:motorBenchReport})))
  const audio = createEditorAudio(signal)
  function updateSoundControl() {
    const button = el('sound')
    button.setAttribute('aria-pressed', String(audio.enabled))
    button.title = audio.enabled ? t.muteSound : t.enableSound
  }
  updateSoundControl()
  const library = mountLibrary(root.querySelector('#editor-library-body'), {
    sections, models: parts, language, labels: t, selectPart: selectLibraryPart, hasConnectors, signal,
  })
  if (buildingSet) {
    const libraryBody = root.querySelector('#editor-library-body')
    const full = node('div')
    full.append(...libraryBody.childNodes)
    const paletteRoot = node('div', undefined, 'set-palette')
    const tabs = node('div', undefined, 'set-tabs')
    const all = control(language === 'ru' ? 'Все детали' : 'All parts', () => showSet(false), signal)
    const set = control(language === 'ru' ? 'Детали набора' : 'Set parts', () => showSet(true), signal)
    function showSet(active) {
      full.hidden = active; paletteRoot.hidden = !active
      all.setAttribute('aria-pressed', String(!active)); set.setAttribute('aria-pressed', String(active))
    }
    tabs.append(all, set); libraryBody.append(tabs, full, paletteRoot)
    setPalette = mountSetPalette(paletteRoot, { ...buildingSet.set, inventory }, { language, catalog: parts, groups: sections.flatMap(section => section.groups), signal,
      select: selectLibraryPart, readParts: () => [...state.parts, ...hiddenParts],
      focus(item) {
        const ids = state.parts.filter(part => part.design === item.design && part.color?.toLowerCase() === item.color.toLowerCase()).map(part => part.id)
        if (ids.length) { selectParts(ids); scene.focus(ids) }
      },
      inspect: item => inspectSetPart(item, { language, signal, prepare: prepareModel, model: design => models.get(design) }),
    })
    findSetPart = (...ids) => {
      workspaceUI.openPanel('library')
      libraryBody.closest('[data-panel]').querySelector('[data-panel-toggle][aria-expanded="false"]')?.click()
      showSet(true)
      setPalette.find(...ids)
    }
    showSet(true)
  }
  reportLoad?.('inventory', Boolean(buildingSet))
  const partsPanel = mountScenePartsPanel(el('sceneParts'), t, {
    nameOf: part => parts[part.design][language],
    colorOf: part => part.color ?? parts[part.design].color,
    selectPart: (id, toggle) => selectClick(id, toggle),
    selectGroup: (id, toggle) => selectParts(state.layers.groups.find(group => group.id === id).partIds, toggle),
    createGroup,
    lockLabel:id=>locked(id)?tr('Разблокировать','Unlock'):tr('Заблокировать','Lock'),
    toggleLock:id=>{const ids=new Set(state.layers.lockedPartIds??[]);ids.has(id)?ids.delete(id):ids.add(id);commitLayers({lockedPartIds:[...ids]})},
    togglePart: id => setPartsHidden([id], isolation ? !hidden.has(id) : !state.layers.hiddenPartIds.includes(id)),
    deletePart: id => removeParts([id]),
    toggleGroup: id => {
      isolation = undefined
      changeGroup(id, group => ({ ...group, hidden: !group.hidden }))
    },
    renameGroup: (id, name) => changeGroup(id, group => ({ ...group, name })),
    moveToGroup: (ids, id) => commitLayers({ groups: moveToSceneGroup(state.layers.groups, new Set(ids), id) }),
    ungroup: id => {
      const group = state.layers.groups.find(group => group.id === id)
      commitLayers({ groups: state.layers.groups.filter(group => group.id !== id),
        hiddenPartIds: group.hidden ? [...new Set([...state.layers.hiddenPartIds, ...group.partIds])] : state.layers.hiddenPartIds })
    },
    deleteGroup: id => {
      const group = state.layers.groups.find(group => group.id === id)
      removeParts(group.partIds, id)
    },
    isolate: toggleIsolation,
    showAll: () => updateVisibility(hasSavedHidden() ? {
      hiddenPartIds: [], groups: state.layers.groups.map(group => group.hidden ? { ...group, hidden: false } : group),
    } : undefined),
  }, signal)
  const beltPanel = mountBeltPanel(el('beltPanel'), {
    t, language, signal,
    nameOf: part => parts[part.design][language],
    preview: plan => scene.belts.preview(plan),
    add: record => {
      const belts = [...state.belts, record]
      const trial = createAssembly(state.parts, state.links, { belts })
      const motion = rotationMotion(record.a.part, state.parts, trial)
      if (!motion?.ok || !(motion.belts ?? motion.rotation?.belts)?.some(belt => belt.record.id === record.id)) return false
      commit({ ...state, belts })
      audio.play('snap')
      return true
    },
    remove: id => commit({ ...state, belts: state.belts.filter(record => record.id !== id) }),
  })
  let focusedTrack
  const trackPanel = mountTrackPanel(el('trackPanel'), {
    language, signal,
    nameOf: design => parts[design][language].split(' · ')[0],
    colorOf: () => '#202124',
    prepare: design => prepareModel(parts[design]),
    preview: plan => {
      const preview = plan?.preview.map(part => ({ ...part, color: '#ffd16a' })) ?? []
      const key = plan?.wheelIds.join(',')
      if (key && key !== focusedTrack) {
        scene.setHidden(hidden)
        scene.focus(plan.wheelIds)
        focusedTrack = key
      }
      scene.setHidden(plan ? new Set([...hidden, ...plan.covered]) : hidden)
      scene.setGroupGhost(preview, preview[0], preview[0])
    },
    apply: plan => {
      commit({ ...state, parts: plan.scene, links: plan.links, layers: plan.layers })
      audio.play('snap')
    },
  })
  let driveConfig = source.testDrive
  const drivePanel = mountDrivePanel(el('drivePanel'), {
    language, scene, models, catalog: parts, signal,
    read: () => ({ parts: state.parts, assembly, config: driveConfig }),
    write: config => { driveConfig = config; persist() },
    nameOf: id => parts[state.parts.find(part => part.id === id)?.design]?.[language] ?? id,
  })
  const undo = []
  const redo = []
  el('name').value = source.name

  const motorPanel = mountMotorPanel(el('motorPanel'), { language, signal,
    read: () => state.parts,
    change: (id, electric) => commit({ ...state, parts: state.parts.map(part => part.id === id ? { ...part, electric } : part) }),
  })

  const cablePanel = mountCablePanel(el('cablePanel'), el('editCable'), scene, language, (id, route) => {
    commit({ ...state, parts: state.parts.map(part => part.id === id ? { ...part, electric: { ...part.electric, route } } : part) })
  }, signal)

  function currentDocument() {
    return {
      ...source,
      customInstructions,
      ...(buildingSet && { buildingSet }),
      ...(driveConfig && { testDrive: driveConfig }),
      name: el('name').value.trim() || source.name,
      parts: [...state.parts, ...hiddenParts],
      sceneLayers: state.layers,
      connections: [...state.links, ...unknownLinks],
      belts: [...state.belts, ...hiddenBelts],
      gears: [...gearPoses(state.parts).map(({ part, center, axis }) => ({ part, center, axis })), ...hiddenGears],
    }
  }

  function persist(showMessage = false) {
    const successful = save(currentDocument())
    workspaceUI.setSaved(successful)
    setMessage(successful ? (showMessage ? t.ready : '') : t.storage, !successful)
    render()
    return successful
  }

  const tr=(a,b)=>language==='ru'?a:b
  const editing=()=>mode==='build'&&!dragActive()&&!pendingPart&&!snappingScene
  const locked=id=>state.layers.lockedPartIds?.includes(id)===true
  const unlockedSelection=()=>editing()&&selectionIds().length>0&&!selectionIds().some(locked)
  function toggleLocked(){if(!editing()||!selectionIds().length)return;const ids=new Set(state.layers.lockedPartIds??[]),unlock=selectionIds().every(id=>ids.has(id));for(const id of selectionIds())unlock?ids.delete(id):ids.add(id);commitLayers({lockedPartIds:[...ids]})}
  function selectMatching(byColor=false){if(!editing()||!selectedPart())return;const p=selectedPart(),color=x=>String(x.color??parts[x.design]?.color).toLowerCase();selectParts(state.parts.filter(x=>!hidden.has(x.id)&&(byColor?color(x)===color(p):x.design===p.design)).map(x=>x.id))}
  function focusSelection(){scene.focus(selectionIds())}
  function openInstruction(){if(!editing()||!state.parts.length)return;void import('./instruction-studio.js?v=context-pages-1').then(({openInstructionStudio})=>{if(!signal.aborted)openInstructionStudio({document:currentDocument(),selection:selectionIds(),language,signal,partsCatalog:parts,models,save:steps=>{customInstructions=structuredClone(steps);return persist(true)}})}).catch(()=>{setMessage(tr('Не удалось открыть студию инструкций. Проверь загрузку геометрии (до 2000 деталей).','Could not open Instruction Studio. Check geometry loading (up to 2000 parts).'));render()})}
  function showPowerFlow(play=false){if(!selectedPart()||dragActive())return;if(mode!=='kinematics')setMode('kinematics');workspaceUI.openPanel('inspector');if(transmission?.ok){if(!mapUI.enabled)el('transmissionMap').querySelector('button').click();if(play&&!el('play').hidden&&!el('play').disabled)el('play').click()}else if(hinge?.ok){setMessage(tr('Для этого соединения доступен угол поворота.','This joint has an angle control.'));render()}else{setMessage(tr('Передача вращения не обнаружена.','No rotational transmission detected.'));render()}}
  function choiceDialog(title,fill){if(window.document.querySelector('dialog[open]'))return;const d=window.document,dialog=d.createElement('dialog');dialog.className='bricklab-choice';const h=d.createElement('h2');h.textContent=title;const status=d.createElement('p');status.setAttribute('role','status');const body=d.createElement('div');body.className='bricklab-choice-body';const close=d.createElement('button');close.type='button';close.textContent=tr('Закрыть','Close');close.onclick=()=>dialog.close();dialog.append(h,status,body,close);dialog.addEventListener('close',()=>{scene.setGhost(null);dialog.remove()},{once:true});signal.addEventListener('abort',()=>dialog.remove(),{once:true});d.body.append(dialog);dialog.showModal();fill({dialog,body,status,button:(label,run)=>{const b=d.createElement('button');b.type='button';b.textContent=label;b.onclick=run;return b}})}
  async function openSmartConnect(){if(!editing()||selectionIds().length!==2)return;if(state.parts.length>2000){setMessage(tr('Smart Connect доступен до 2000 деталей.','Smart Connect supports up to 2000 parts.'));render();return}const before=state,[a,b]=selectionIds().map(id=>state.parts.find(p=>p.id===id));const loose=p=>!locked(p.id)&&!state.links.some(l=>l.shaft.part===p.id||l.socket.part===p.id)&&!state.belts.some(l=>l.a.part===p.id||l.b.part===p.id);const moving=a&&b?(loose(a)?a:loose(b)?b:null):null,fixed=moving===a?b:a;if(!moving){setMessage(tr('Для Smart Connect одна деталь должна быть свободной и незаблокированной.','Smart Connect needs one loose, unlocked part.'));render();return}
    const {smartConnections}=await import('./smart-connect.js');if(signal.aborted||state!==before)return
    const options=smartConnections(moving,fixed,state.parts,state.links,state.belts)
    choiceDialog('Smart Connect',({dialog,body,status,button})=>{status.textContent=options.length?tr('Выбери проверенное соединение. Перемещается только свободная деталь.','Choose a verified connection. Only the loose part moves.'):tr('Подходящих свободных креплений не найдено.','No compatible free ports found.');for(const opt of options){const row=window.document.createElement('div');row.className='choice-row';row.append(button(opt.label,()=>scene.setGhost(opt.pose)),button(tr('Соединить','Connect'),()=>{if(state!==before||signal.aborted)return;dialog.close();commit({parts:state.parts.map(p=>p.id===moving.id?opt.pose:p),links:[...state.links,opt.link]})}));body.append(row)}})
  }
  function openReplace(){if(!unlockedSelection()||selectionIds().length!==1)return;const p=selectedPart(),before=state,group=parts[p.design]?.group
    choiceDialog(tr('Заменить деталь','Replace part'),({dialog,body,status,button})=>{const d=window.document,input=d.createElement('input'),results=d.createElement('div');input.type='search';input.placeholder=tr('Название или артикул','Name or design ID');body.append(input,results)
      const draw=()=>{results.replaceChildren();const q=input.value.trim().toLowerCase();const candidates=Object.values(parts).filter(x=>x.design!==p.design&&(q?String(x.design+' '+x[language]+' '+x.en).toLowerCase().includes(q):x.group===group)).slice(0,40);for(const candidate of candidates)results.append(button(candidate.design+' · '+candidate[language],async()=>{if(state!==before||signal.aborted)return;try{status.textContent=tr('Проверяем соединения…','Checking connections…');await prepareModel(candidate);if(state!==before||signal.aborted||!dialog.open)return;const replacement={...p,design:candidate.design};delete replacement.electric;const placed=state.parts.map(x=>x.id===p.id?replacement:x),retained=transformLinks(placed,[p.id]);const check=createAssembly(placed,retained,{belts:state.belts});if(check.connections.length!==state.links.length||check.belts.length!==state.belts.length){status.textContent=tr('Замена нарушит соединения. Выбери другой вариант.','Replacement would break connections. Choose another.');return}dialog.close();commit({parts:placed,links:retained})}catch{status.textContent=tr('Не удалось загрузить деталь.','Part could not be loaded.')}}))}
      input.oninput=draw;draw()})
  }
  function revealAll(){updateVisibility({hiddenPartIds:[],groups:state.layers.groups.map(g=>({...g,hidden:false}))})}
  async function exportFormat(format){if(dragActive())return;try{const {inventoryCsv,ldrawText,downloadText}=await import('./project-exports.js');const doc=currentDocument();if(format==='csv')downloadText(doc.name+'.csv',inventoryCsv(doc,parts),'text/csv');else if(format==='ldr')downloadText(doc.name+'.ldr',ldrawText(doc,parts))}catch{setMessage(tr('Не удалось экспортировать файл.','Export failed.'));render()}}
  let cloudBusy=false
  function cloudAction(kind){if(cloudBusy||!editing()||!persist())return;cloudBusy=true;Promise.resolve(projectActions?.[kind]?.(currentDocument())).then(ok=>{if(!signal.aborted&&ok!==undefined){setMessage(ok?(kind==='shareLink'?tr('Ссылка скопирована','Link copied'):tr('Сохранено в облаке','Saved to cloud')):tr('Облачное сохранение не выполнено.','Cloud save not completed.'));render()}}).catch(e=>{if(!signal.aborted){setMessage(e.code==='revision_conflict'?tr('В облаке новая версия. Локальная копия сохранена.','Cloud revision conflict. Local copy retained.'):e.message==='not_published'?tr('Сначала опубликуй сборку.','Publish the build first.'):e.message==='not_linked'?tr('Сначала сохрани сборку в облако.','Save the build to cloud first.'):tr('Войди в аккаунт или проверь соединение.','Sign in or check your connection.'));render()}}).finally(()=>{cloudBusy=false})}
  function commandList(){const c=(id,label,group,run,enabled=()=>true,shortcut='',keywords='')=>({id,label,group,run,enabled,shortcut,keywords});const project=tr('Проект','Project'),edit=tr('Редактор','Editor'),view=tr('Вид','View'),mech=tr('Механика','Mechanics')
    return [c('rename',tr('Переименовать','Rename'),project,()=>workspaceUI.rename()),c('new',tr('Новая сборка','New build'),project,()=>projectActions?.newBuild?.(),editing),c('copyProject',tr('Создать копию','Duplicate project'),project,()=>projectActions?.copy?.(currentDocument()),editing),c('home',tr('Мои сборки','My builds'),project,()=>projectActions?.home?.(),editing),c('save',tr('Сохранить','Save'),project,()=>persist(true),editing,'Ctrl+S'),c('cloud',tr('Сохранить в облако','Save to cloud'),project,()=>cloudAction('cloud'),editing),c('history',tr('История версий','Version history'),project,()=>cloudAction('history'),editing),c('photo','Photo Studio',project,()=>workspaceUI.photo(),editing,'',tr('фотостудия фото','photo image')),c('instructions','Instruction Studio',project,openInstruction,()=>editing()&&state.parts.length>0,'',tr('инструкция PDF','instructions PDF')),c('live',tr('Совместная сессия','Live collaboration'),project,()=>collaborationUI?.open(),editing),c('publish',tr('Опубликовать','Publish'),project,()=>el('publish').click(),()=>editing()&&!el('publish').hidden),c('shareLink',tr('Скопировать публичную ссылку','Copy public link'),project,()=>cloudAction('shareLink'),editing),c('bricklab','BrickLab (.bricklab)',project,()=>download(currentDocument()),editing),c('ldr','LDraw (.ldr)',project,()=>exportFormat('ldr'),editing),c('csv',tr('Список деталей CSV','Parts CSV'),project,()=>exportFormat('csv'),editing),c('duplicate',tr('Дублировать деталь','Duplicate part'),edit,()=>insertCopy(clipboardSelection()),()=>editing()&&!!selected,'Ctrl+D'),c('paint',tr('Изменить цвет','Change color'),edit,()=>{workspaceUI.openPanel('inspector');el('color').click()},()=>editing()&&!!selected),c('replace',tr('Заменить деталь','Replace part'),edit,openReplace,()=>unlockedSelection()&&selectionIds().length===1),c('sameDesign',tr('Выделить одинаковые детали','Select same design'),edit,()=>selectMatching(),()=>editing()&&!!selected),c('sameColor',tr('Выделить одинаковый цвет','Select same color'),edit,()=>selectMatching(true),()=>editing()&&!!selected),c('lock',selectionIds().length&&selectionIds().every(locked)?tr('Разблокировать','Unlock'):tr('Заблокировать','Lock'),edit,toggleLocked,()=>editing()&&!!selected),c('group',tr('Создать группу','Create group'),edit,createGroup,()=>editing()&&!!selected,'Ctrl+G'),c('hide',tr('Скрыть детали','Hide parts'),edit,()=>setPartsHidden(selectionIds(),true),()=>editing()&&!!selected,'H'),c('isolate',tr('Изолировать выделение','Isolate selection'),edit,toggleIsolation,()=>editing()&&(!!selected||!!isolation),'Ctrl+H'),c('showAll',tr('Показать скрытые детали','Show hidden parts'),view,revealAll,editing),c('focus',tr('Приблизить к детали','Focus selection'),view,focusSelection,()=>!!selected),c('reset',tr('Сбросить вид','Reset view'),view,()=>scene.resetView()),c('connect','Smart Connect',mech,()=>void openSmartConnect().catch(()=>{setMessage(tr('Ошибка поиска соединений.','Connection search failed.'));render()}),()=>editing()&&selectionIds().length===2,'',tr('соединить детали','connect parts')),c('flow','Power Flow',mech,()=>showPowerFlow(),()=>!!selected&&!dragActive(),'',tr('передача вращения','transmission')),c('play',tr('Запустить механизм','Run mechanism'),mech,()=>showPowerFlow(true),()=>!!selected&&!dragActive()),c('length',tr('Изменить длину оси','Change axle length'),edit,()=>setTool('length'),()=>unlockedSelection()&&canResize(selectedPart())),c('remove',tr('Удалить','Delete'),edit,()=>removeParts(),()=>editing()&&!!selected,'Del'),...['select','move','rotate','box','belt','track'].map(k=>c('tool-'+k,({select:tr('Выделение','Select'),move:tr('Перемещение','Move'),rotate:tr('Вращение','Rotate'),box:tr('Рамка','Box selection'),belt:tr('Ремень','Belt'),track:tr('Гусеница','Track')})[k],edit,()=>setTool(k),editing)),...['library','inspector','scene-parts','instruction'].filter(k=>root.querySelector('[data-panel="'+k+'"]')).map(k=>c('panel-'+k,({library:tr('Библиотека','Library'),inspector:tr('Инспектор','Inspector'),'scene-parts':tr('Детали сцены','Scene parts'),instruction:tr('Инструкция','Instruction')})[k],view,()=>workspaceUI.openPanel(k))),c('grid',tr('Сетка','Grid'),view,()=>workspaceUI.toggleView('grid')),c('axes',tr('Оси координат','Axes'),view,()=>workspaceUI.toggleView('axes')),c('fullscreen',tr('Полноэкранный режим','Fullscreen'),view,()=>workspaceUI.toggleView('fullscreen')),c('ortho',tr('Ортографическая камера','Orthographic camera'),view,()=>{scene.setCameraMode('orthographic');render()},()=>!dragActive()&&mode!=='testDrive'),c('perspective',tr('Перспективная камера','Perspective camera'),view,()=>{scene.setCameraMode('perspective');render()},()=>!dragActive()&&mode!=='testDrive')]
  }
  function invokeCommand(id){const cmd=commandList().find(c=>c.id===id);if(cmd&&cmd.enabled()!==false)cmd.run()}
  function openCommands(){void import('./command-palette.js').then(({openCommandPalette})=>{if(!signal.aborted)openCommandPalette({commands:commandList,language,signal,searchParts:q=>editing()?Object.values(parts).filter(p=>(p.design+' '+p[language]+' '+p.en).toLowerCase().includes(q.toLowerCase())).slice(0,12).map(p=>({label:p.design+' · '+p[language],group:tr('Библиотека','Library'),run:()=>void selectLibraryPart(p)})):[]})})}

  function selectedPart() {
    return state.parts.find(part => part.id === selected)
  }

  function stopAnimation() {
    stopClutchTest()
    if (frame) cancelAnimationFrame(frame)
    frame = undefined
  }

  function stopClutchTest() {
    if (!clutchTest) return
    cancelAnimationFrame(clutchTest.frame)
    clutchTest.simulation?.dispose()
    clutchTest = undefined
    if (!signal.aborted) scene.setParts(state.parts)
  }

  function selectedClutch() {
    return mode === 'kinematics' && links.find(link => link.fit.motion.torqueLimit &&
      !hidden.has(link.shaft.part) && !hidden.has(link.socket.part) &&
      [link.shaft.part, link.socket.part].includes(selected))
  }

  async function testClutch() {
    if (clutchTest) {
      stopClutchTest()
      render()
      return
    }
    const link = selectedClutch()
    if (!link) return
    stopAnimation()
    releaseMotor()
    const test = clutchTest = {}
    render()
    try {
      const [{ createPhysicalAssembly }, { loadRapier }] = await Promise.all([
        import('../mechanics/physical-assembly.js?v=torque-clutch'), import('../mechanics/physics-world.js'),
      ])
      const rapier = await loadRapier()
      if (signal.aborted || clutchTest !== test) return
      const { shaft, socket } = link
      const halves = [shaft.part, socket.part]
      const axleLinks = links.filter(item => !item.fit.motion.torqueLimit && item.fit.motion.rotation === 'locked' &&
        halves.includes(item.socket.part) && !hidden.has(item.shaft.part))
      const ids = new Set([...halves, ...axleLinks.map(item => item.shaft.part)])
      const pieces = state.parts.filter(part => ids.has(part.id))
      const paired = createAssembly(pieces, [link, ...axleLinks].map(connectionRecord))
      const joints = assemblyJoints(pieces, paired)
      const joint = joints.find(item => item.torqueLimit)
      const simulation = test.simulation = createPhysicalAssembly(rapier, pieces, joints, models, {
        pinned: [socket.part], gravityEnabled: false,
      })
      scene.setParts(state.parts)
      const drive = { part: shaft.part, torque: new Vector3().fromArray(joint.shaftLine.axis).multiplyScalar(joint.torqueLimit * 1.4) }
      let last
      function advance(time) {
        scene.previewParts(simulation.advance((time - (last ?? time)) / 1000, drive))
        last = time
        test.frame = requestAnimationFrame(advance)
      }
      test.frame = requestAnimationFrame(advance)
      render()
    } catch (error) {
      if (signal.aborted || clutchTest !== test) return
      stopClutchTest()
      console.error(error)
      setMessage(t.clutchTestError)
      render()
    }
  }

  function releaseMotor() {
    if (runningMotor) cancelAnimationFrame(runningMotor.frame)
    runningMotor = undefined
  }

  function motorTick(time) {
    const motor = runningMotor
    if (!motor) return
    const motion = motor.motion
    const dt = Math.min(50, time - (motor.last ?? time)) / 1000
    motor.last = time
    if (motion?.ok && motion.playback) {
      motor.degrees += motion.playback * dt * motionSpeed
      const radians = motor.degrees * Math.PI / 180
      const poses = rotationPoses(state.parts, motion, radians)
      if (poses) scene.previewParts(poses)
      scene.belts.travel(new Map(motion.belts?.map(belt =>
        [belt.record.id, beltTravel(belt, motion.spins, radians)])))
      if (selected === motor.id) {
        angle = ((motor.degrees % 360) + 360) % 360
        el('angle').value = angle
        el('degrees').textContent = Math.round(angle) + '°'
      }
    }
    motor.frame = requestAnimationFrame(motorTick)
  }

  signal.addEventListener('abort', () => {
    releaseMotor()
    stopAnimation()
    clearTimeout(messageTimer)
    scene.dispose()
  }, { once: true })

  function showMotion(audible = false, wrappedAngle = 0) {
    const previous = lastPreview
    if (hinge?.ok) {
      const target = nearestDetent(hinge.detents, angle * Math.PI / 180)
      angle = target * 180 / Math.PI
      lastPreview = angle
      scene.previewParts(hingePoses(state.parts, hinge, target).filter(part => hinge.moving.has(part.id)))
      scene.select(selected)
      el('applyHinge').disabled = Math.abs(target - hinge.roll) < 1e-8
      if (audible) audio.advanceRotation(angle - previous, true)
    } else if (transmission?.ok) {
      const value = transmission.unit === 'linear' ? angle : angle * Math.PI / 180
      const poses = rotationPoses(state.parts, transmission, value, Number(el('motionAxis').value))
      if (!poses) {
        angle = lastPreview
      } else {
        lastPreview = angle
        scene.previewParts(poses)
        lastMotionPoses=poses
        if(mapUI.enabled&&performance.now()-lastMapUpdate>100)refreshTransmissionMap()
        scene.belts.travel(new Map(transmission.belts?.map(belt =>
          [belt.record.id, beltTravel(belt, transmission.spins, value)])))
        scene.select(selected)
        if (audible && transmission.unit !== 'linear') audio.advanceRotation(angle - previous + wrappedAngle)
      }
    }
    el('degrees').textContent = transmission?.unit === 'linear'
      ? `${Number((angle * .4).toFixed(2))} ${t.millimeters}` : `${Number(angle.toFixed(2))}°`
    el('angle').value = angle
  }

  const selectionIds = () => selected ? [selected, ...additional] : []
  const canResize = part => Boolean(part)&&!locked(part.id)&&!additional.size && axleOptions(part).length > 1
  const dragActive = () => Boolean(moving || gizmoPart || resize || boxSelection)
  const snapAllowed = event => snapEnabled && !event?.ctrlKey && !event?.metaKey

  function selectClick(id, toggle = false) {
    if (!toggle || mode !== 'build') {
      additional.clear()
      setSelection(id)
    } else if (id === selected) {
      const next = additional.values().next().value
      additional.delete(next)
      setSelection(next)
    } else if (id) {
      if (!selected) setSelection(id)
      else {
        if (additional.has(id)) additional.delete(id)
        else additional.add(id)
        setSelection(selected)
      }
    }
  }

  function selectParts(ids, toggle = false) {
    const requested = new Set(ids)
    const next = new Set(toggle ? selectionIds() : [])
    const remove = toggle && state.parts.every(part => !requested.has(part.id) || next.has(part.id))
    for (const part of state.parts) {
      if (!requested.has(part.id)) continue
      if (remove) next.delete(part.id)
      else next.add(part.id)
    }
    const primary = next.has(selected) && !hidden.has(selected)
      ? selected : [...next].find(id => !hidden.has(id)) ?? next.values().next().value
    next.delete(primary)
    additional.clear()
    for (const id of next) additional.add(id)
    setSelection(primary)
  }

  function cancelBoxSelection() {
    boxSelection = undefined
    selectionFrame.hidden = true
  }

  function updateSelectionFrame(event) {
    if (selectionFrame.hidden && Math.hypot(event.clientX - boxSelection.x, event.clientY - boxSelection.y) < 5) return
    const rect = scene.canvas.getBoundingClientRect()
    const canvasWidth = rect.width
    const canvasHeight = rect.height
    const x = clientX => Math.max(0, Math.min(canvasWidth, clientX - rect.left))
    const y = clientY => Math.max(0, Math.min(canvasHeight, clientY - rect.top))
    const left = x(Math.min(boxSelection.x, event.clientX))
    const right = x(Math.max(boxSelection.x, event.clientX))
    const top = y(Math.min(boxSelection.y, event.clientY))
    const bottom = y(Math.max(boxSelection.y, event.clientY))
    Object.assign(selectionFrame.style, {
      left: `${left}px`, top: `${top}px`,
      width: `${Math.max(1, right - left)}px`, height: `${Math.max(1, bottom - top)}px`,
    })
    selectionFrame.hidden = false
    return { left, top, right, bottom, canvasWidth, canvasHeight }
  }

  function refreshPartsPanel() {
    partsPanel.render({ parts: state.parts, layers: state.layers, hidden, isolated: Boolean(isolation), selected: new Set(selectionIds()) })
  }

  function refreshLayerVisibility() {
    benchUI.clear()
    if (isolation && !state.parts.some(part => isolation.has(part.id))) isolation = undefined
    hidden = hiddenSceneParts(state.layers, state.parts, isolation)
    scene.setHidden(hidden)
  }

  function toggleIsolation() {
    const ids = selectionIds()
    if (!isolation && !ids.length) return
    isolation = isolation ? undefined : new Set(ids)
    refreshLayerVisibility()
    refreshPartsPanel()
    render()
  }

  function commitLayers(changes) {
    commit({ ...state, layers: { ...state.layers, ...changes } })
  }

  function changeGroup(id, update) {
    commitLayers({ groups: state.layers.groups.map(group => group.id === id ? update(group) : group) })
  }

  function createGroup() {
    const ids = new Set(selectionIds())
    const names = new Set(state.layers.groups.map(group => group.name))
    let number = 1
    while (names.has(t.groupName(number))) number++
    const group = { id: crypto.randomUUID(), name: t.groupName(number), partIds: [], hidden: false }
    commitLayers({ groups: moveToSceneGroup([...state.layers.groups, group], ids, group.id) })
  }

  function hasSavedHidden() {
    return state.layers.hiddenPartIds.length > 0 || state.layers.groups.some(group => group.hidden)
  }

  function updateVisibility(changes) {
    const wasIsolated = Boolean(isolation)
    isolation = undefined
    if (changes) commitLayers(changes)
    else if (wasIsolated) {
      refreshLayerVisibility()
      refreshPartsPanel()
      render()
    }
  }

  function setPartsHidden(ids, value) {
    const next = new Set(state.layers.hiddenPartIds)
    for (const id of ids) {
      if (value) next.add(id)
      else next.delete(id)
    }
    updateVisibility(next.size !== state.layers.hiddenPartIds.length ? { hiddenPartIds: [...next] } : undefined)
  }

  function removeParts(partIds = selectionIds(), groupId) {
    if (mode !== 'build' || dragActive() || (!partIds.length && !groupId)) return
    if(partIds.some(locked)){setMessage(tr('Сначала разблокируй детали.','Unlock the parts first.'));render();return}
    const ids = new Set(partIds.filter(id => !hiddenIds.has(id)))
    const layers = {
      groups: moveToSceneGroup(state.layers.groups.filter(group => group.id !== groupId), ids),
      hiddenPartIds: state.layers.hiddenPartIds.filter(id => !ids.has(id)),
      lockedPartIds:(state.layers.lockedPartIds??[]).filter(id=>!ids.has(id)),
    }
    commit({ layers, parts: state.parts.filter(part => !ids.has(part.id)),
      links: state.links.filter(link => !ids.has(link.shaft.part) && !ids.has(link.socket.part)),
      belts: state.belts.filter(belt => !ids.has(belt.a.part) && !ids.has(belt.b.part)) })
  }

  function setSelection(id) {
    benchUI.clear()
    stopAnimation()
    audio.resetRotation()
    scene.setParts(state.parts)
    scene.belts.travel(new Map())
    selected = id
    if (mode === 'build') {
      const selectedIds = new Set([id, ...additional])
      for (const link of assembly.connections) {
        if (selectedIds.has(link.shaft.part) && link.shaft.port === 'control-plus-output') additional.add(link.socket.part)
      }
    }
    selectorLinkage = linkedSelector(id, state.parts, assembly)
    if (tool === 'length' && !canResize(selectedPart())) tool = 'move'
    scene.select(mode === 'paint' ? undefined : id)
    updateHighlights()
    hinge = mode === 'kinematics' && id ? hingeMotion(id, state.parts, links) : undefined
    angle = hinge?.ok ? hinge.roll * 180 / Math.PI : 0
    lastPreview = angle
    transmission = mode === 'kinematics' && !hinge ? rotationMotion(id, state.parts, assembly, selectorLinkage) : null
    lastMotionPoses=[]
    showMotion()
    refreshTransmissionMap()
    refreshPartsPanel()
    render()
    if (mode === 'kinematics' && id) tutorial?.handle('gearSelected', { rotatable: Boolean(hinge?.ok || transmission?.ok) })
  }

  function applyState(next) {
    const geometryChanged = state.parts !== next.parts && (state.parts.length !== next.parts.length ||
      next.parts.some((part, index) => {
        const previous = state.parts[index]
        return part.id !== previous.id || part.design !== previous.design ||
          part.position !== previous.position || part.rotation !== previous.rotation
      }))
    const mechanicalChange = geometryChanged || state.links !== next.links || state.belts !== next.belts
    state = next
    setPalette?.update([...state.parts, ...hiddenParts])
    if (mechanicalChange) {
      assembly = createAssembly(state.parts, state.links, { belts: state.belts })
      state.belts = assembly.belts.map(({ record }) => record)
      scene.belts.set(state.belts)
      links = assembly.connections
      state.links = links.map(connectionRecord)
    }
    if (runningMotor) {
      const motor = state.parts.find(part => part.id === runningMotor.id)
      if (!motor || !motor.electric?.power) releaseMotor()
      else runningMotor.motion = rotationMotion(motor.id, state.parts, assembly)
    }
    refreshLayerVisibility()
    const ids = new Set(state.parts.map(part => part.id))
    for (const id of additional) if (!ids.has(id)) additional.delete(id)
    if (!ids.has(selected)) {
      selected = additional.values().next().value
      additional.delete(selected)
    }
    setSelection(state.parts.some(part => part.id === selected) ? selected : undefined)
    persist()
  }

  function commit(next) {
    if(next.parts){const byId=new Map(next.parts.map(p=>[p.id,p]));if(state.parts.some(p=>{const n=byId.get(p.id);return locked(p.id)&&n&&(n.design!==p.design||Boolean(n.mirrored)!==Boolean(p.mirrored)||!samePose(p,n))})){setMessage(tr('Сначала разблокируй детали.','Unlock the parts first.'));render();return false}}
    const beforeLinks = state.links
    undo.push(state)
    if (undo.length > 80) undo.shift()
    redo.length = 0
    applyState({ belts: state.belts, layers: state.layers, ...next })
    if (hasNewConnection(beforeLinks, state.links)) tutorial?.handle('connected')
    return true
  }

  function paintPart(id, color, allMatching = false) {
    const part = state.parts.find(item => item.id === id)
    if (!part) return
    let changed = false
    const painted = state.parts.map(item => {
      const matches = allMatching ? item.design === part.design : item === part
      if (!matches || String(item.color ?? parts[item.design].color).toLowerCase() === color) return item
      changed = true
      return { ...item, color }
    })
    if (changed) {
      commit({ ...state, parts: painted })
      tutorial?.handle('painted')
    }
  }

  function updatePaintSwatches() {
    for (const swatch of paintSwatches) swatch.setAttribute('aria-pressed', String(swatch.dataset.paint === paintColor.value))
  }

  function restore(from, to) {
    if (!from.length) return
    cancelPlacement()
    cancelGizmo()
    cancelResize()
    to.push(state)
    const next = from.pop()
    if (!selected) {
      const currentIds = new Set(state.parts.map(part => part.id))
      const restored = next.parts.filter(part => !currentIds.has(part.id))
      if (restored.length === 1) selected = restored[0].id
    }
    applyState(next)
  }

  async function selectLibraryPart(part) {
    if (mode !== 'build') return
    if (/spring|пружин/i.test(`${part.en ?? ''} ${part.ru ?? ''}`)) showEditorTip(root, 'spring', language, signal)
    if (tool === 'track') setTool('move')
    cancelPlacement()
    const request = { part }
    pendingPart = request
    setMessage()
    render()
    try {
      const initial = { id: crypto.randomUUID(), design: part.design, position: [0, 0, 0],
        rotation: baseRotation, color: part.color }
      const bundle = componentBundle(initial, parts, () => crypto.randomUUID())
      await Promise.all((bundle ? [bundle.anchor, ...bundle.items] : [initial]).map(item => prepareModel(parts[item.design])))
      if (pendingPart !== request || signal.aborted) return
      pendingPart = undefined
      startPlacement(bundle?.anchor ?? initial, false, undefined, bundle)
    } catch (error) {
      if (pendingPart !== request || signal.aborted) return
      pendingPart = undefined
      setMessage(t.partLoadError(part[language]))
      console.error(error)
      render()
    }
  }

  function selectingByBox() {
    return mode === 'build' && tool === 'box' && !moving && !pendingPart
  }

  function setMessage(text = '', persistent = false) {
    clearTimeout(messageTimer)
    message = text
    if (text && !persistent) messageTimer = setTimeout(() => {
      message = ''
      renderHint()
    }, 5000)
  }

  function render() {
    estimateUI.render(mode==='kinematics'?transmission:null,state.parts)
    benchUI.render(selectedPart(),mode==='kinematics'&&!hidden.has(selected))
    el('engineeringReport').hidden=mode!=='kinematics'
    const part = selectedPart()
    const selectedLinks = part ? links.filter(link => link.shaft.part === part.id || link.socket.part === part.id) : []
    el('selection').textContent = additional.size ? t.selectedCount(selectionIds().length)
      : part ? parts[part.design][language] : transmission?.kind === 'engine' ? t.crankshaft : t.none
    const building = mode === 'build'
    const ringSelected = selectedLinks.some(link => ['selector-guide', 'shift-groove'].includes(link.socket.port) &&
      (link.socket.part === selected || link.socket.port === 'shift-groove'))
    el('selector').hidden = !(building || mode === 'kinematics') || dragActive() || !(selectorLinkage || ringSelected)
    const painting = mode === 'paint'
    const selectingInBox = selectingByBox()
    const addingBelt = building && tool === 'belt'
    const addingTrack = building && tool === 'track'
    const addingConnection = addingBelt || addingTrack
    partsPanel.setEditable(building && !dragActive(), Boolean(isolation), Boolean(isolation) || hasSavedHidden())
    el('selection').hidden = addingConnection
    el('partActions').hidden = !part || !building || addingConnection || dragActive()
    el('paste').hidden = !clipboard || !building || addingConnection || dragActive()
    for (const name of buildTools) {
      const control = el(`${name}Tool`)
      control.disabled = !building || (name === 'length' && !canResize(part)) ||
        (['belt', 'track'].includes(name) && dragActive())
      control.setAttribute('aria-pressed', String(tool === name))
    }
    beltPanel.render(addingBelt, state.parts, assembly.belts)
    trackPanel.render(addingTrack, state, hidden, selectionIds())
    const rotationSnap = el('rotationSnap')
    rotationSnap.disabled = !building || Boolean(gizmoPart || resize)
    rotationSnap.setAttribute('aria-pressed', String(steppedRotation))
    rotationSnap.textContent = steppedRotation ? '45°' : t.freeRotation
    rotationSnap.title = steppedRotation ? t.enableFreeRotation : t.enableRotationSnap
    const jointTool = building && tool === 'rotate' && jointMode
    rotationSnap.hidden = !building || tool !== 'rotate' || jointTool
    el('lengthTool').hidden = !canResize(part)
    el('connectionTools').toggleAttribute('data-active', addingConnection)
    if (!building) el('connectionTools').open = false
    el('pivotMode').hidden = !building || tool !== 'rotate'
    if (!gizmoPart) {
      const joints = jointTool ? rotationJoints(selected) : []
      const joint = joints.includes(chosenJoint) ? chosenJoint : joints.at(-1)
      activeJoint = joint && hingeMotion(selected, state.parts, links, joint)
      if (!activeJoint?.ok) activeJoint = null
      scene.gizmo.setRotationSnap(jointTool ? null : steppedRotation ? rotationStep : null)
      if (!resize) updateHighlights()
    }
    scene.setTool(building && !selectionIds().some(locked) && !(activeJoint?.moving&&[...activeJoint.moving].some(locked)) && !moving && !resize && (!jointTool || activeJoint) && (tool === 'move' || tool === 'rotate')
      ? tool === 'move' ? 'translate' : 'rotate' : null, part, selectionIds(), activeJoint)
    positionHandles()
    if (part) el('color').value = /^#[0-9a-f]{6}$/i.test(part.color) ? part.color : parts[part.design].color
    const engagedBelts = (transmission?.belts ?? transmission?.rotation?.belts)?.length
    const engagedTracks = transmission?.tracks?.length
    const drives = [transmission?.meshes?.length || (!engagedBelts && !engagedTracks) ? `${t.mesh}: ${transmission?.meshes?.length ?? 0}` : '',
      engagedBelts ? t.beltCount(engagedBelts) : '', engagedTracks ? t.trackCount(engagedTracks) : ''].filter(Boolean).join(' · ')
    el('links').hidden = addingBelt
    el('links').textContent = mode === 'kinematics'
      ? hinge ? (hinge.ok ? t.detented : t.closedHinge)
        : transmission ? (transmission.ok ? (t.mechanisms[transmission.kind] ?? drives) : t.transmissionError)
          : t.driver
      : part ? (portsFor(part.design).length ? `${t.joints}: ${selectedLinks.length}` : t.geometryOnly) : ''
    el('motion').hidden = (!hinge?.ok && !transmission?.ok) || mode !== 'kinematics'
    el('play').hidden = Boolean(hinge || (transmission?.solve && !transmission.playback))
    el('speedControl').hidden=el('play').hidden&&!runningMotor
    el('motionAxis').hidden = !transmission?.spherical
    el('motionLabel').textContent = transmission?.unit === 'linear' ? t.travel
      : transmission?.kind === 'engine' ? t.crankAngle : t.drive
    el('applyHinge').hidden = !hinge?.ok
    const range = el('angle')
    range.min = hinge?.ok ? hinge.detents[0] * 180 / Math.PI : transmission?.range?.[0] ?? -1080
    range.max = hinge?.ok ? hinge.detents.at(-1) * 180 / Math.PI : transmission?.range?.[1] ?? 1080
    range.step = hinge?.ok || transmission?.solve ? 'any' : '1'
    range.value = angle
    el('play').textContent = frame ? t.stop : t.play
    el('play').disabled = Boolean(clutchTest) || (transmission?.kind === 'motor' && !transmission.playback)
    range.disabled = Boolean(clutchTest)
    el('clutchTest').hidden = !selectedClutch()
    el('clutchTest').textContent = clutchTest ? t.stop : t.clutchTest
    el('clutchStatus').hidden = !clutchTest?.simulation
    el('clutchStatus').textContent = clutchTest?.simulation ? t.clutchTesting : ''
    motorPanel.render(part, state.parts)
    el('stopRunningMotor').hidden = !runningMotor || selected === runningMotor.id
    if (runningMotor && transmission?.kind === 'motor') el('play').hidden = true
    el('editCable').disabled = !building || el('wires').getAttribute('aria-pressed') === 'false'
    if (!building) cablePanel.close()
    else cablePanel.refresh()
    el('insertion').hidden = !moving
    el('depth').value = String(depth)
    el('empty').textContent = painting ? t.noSceneParts : t.empty
    el('empty').hidden = Boolean(state.parts.length || moving)
    el('count').textContent = `${t.count}: ${state.parts.length} · ${t.linkCount}: ${links.length}` +
      (state.belts.length ? ` · ${t.beltCount(state.belts.length)}` : '')
    el('buildTools').hidden = painting || simulating(mode)
    el('buildTools').toggleAttribute('data-view-only', !building)
    el('paintTools').hidden = !painting
    el('panelLayer').hidden = painting || simulating(mode)
    el('viewport').toggleAttribute('data-painting', painting)
    el('viewport').toggleAttribute('data-box-select', selectingInBox)
    el('groupSelection').hidden = !selectingInBox
    el('groupSelection').disabled = !selected || dragActive()
    scene.enableBoxSelect(selectingInBox)
    for (const name of modes) el(name).setAttribute('aria-pressed', String(mode === name))
    setPalette?.setEnabled(mode === 'build')
    library.setPlacement(!movesExisting ? moving?.design : undefined, pendingPart?.part.design, building)
    el('snapAll').disabled = !building || snappingScene || dragActive() || Boolean(pendingPart) ||
      state.parts.filter(part => !hidden.has(part.id)).length < 2
    el('snap').disabled = !building
    el('snap').setAttribute('aria-pressed', String(snapEnabled))
    el('undo').disabled = simulating(mode) || !undo.length
    el('redo').disabled = simulating(mode) || !redo.length
    workspaceUI.render(mode, tool, state.parts.length, links.length, building && Boolean(part) && !dragActive() && !moving && !addingConnection, !dragActive() && !moving && !pendingPart && !boxSelection, state.belts.length)
    renderHint()
  }

  function renderHint() {
    const fit = candidate?.fit
    const rotationCue = { fixed: t.fixed, locked: t.locked, detented: t.detented, continuous: t.freely, ball: t.ballJoint, slider: t.travel, spring: t.mechanisms.suspension }
    const meshCue = mesh => mesh.kind === 'tread' ? t.treadSnap : t.gearSnap
    const cue = fit ? rotationCue[fit.motion.rotation]
      : candidate?.mesh ? meshCue(candidate.mesh) : candidate?.failure?.includes('occupied') ? t.occupied : candidate?.failure ? t.blocked : t.free
    const nextHint = simulating(mode) ? message : mode === 'paint' ? message || t.paintHint :
      resize ? t.lengthPreview(parts[resize.pose.design][language], resize.lost.length, resize.kept) :
      gizmoSnap?.mesh ? meshCue(gizmoSnap.mesh) : gizmoSnap?.fit ? t.snapPreview : moving ? `${cue} · ${t.place}${placingCopy ? (language === 'ru' ? ' · Ctrl+X/Y/Z — отразить' : ' · Ctrl+X/Y/Z — mirror') : ''}`
      : pendingPart ? t.loadingPart(pendingPart.part[language]) : message ||
        (selectingByBox() ? selected ? `${t.selectedCount(selectionIds().length)} · ${t.boxActions}` : t.boxHint : '')
    if (hint.textContent !== nextHint) hint.textContent = nextHint
  }

  let previewFrame = 0
  function queueGroupPreview(event) {
    pointer = event
    if (!previewFrame) previewFrame = requestAnimationFrame(() => {
      previewFrame = 0
      if (!signal.aborted) updatePointer(pointer)
    })
  }

  function updatePointer(event, cycle = false) {
    cancelAnimationFrame(previewFrame)
    previewFrame = 0
    pointer = event
    if (!moving) return
    const { ground, ray } = scene.pointer(event, false)
    const freePoint = grab ? ray.intersectPlane(grab.plane, new Vector3()) : ground
    let freePosition = null
    if (grab) {
      const delta = freePoint?.sub(grab.anchor)
      const position = moving.position.map((value, i) => i === 1 ? value : value + onGrid(delta?.getComponent(i) ?? 0))
      freePosition = { ...moving, position }
    } else if (freePoint) freePosition = raisedPose(moving, models.get(moving.design), freePoint)
    const options = pastedGroup?.items.length && !pastedGroup.snap && snapAllowed(event) && freePosition
      ? translationSnaps([freePosition, ...groupTransforms(pastedGroup.items, pastedGroup.anchor, freePosition)],
        snapTargets(), placementAssembly, scene, 'XYZ', depth)
      : (!pastedGroup || pastedGroup.snap) && snapAllowed(event)
      ? nearbyConnections({ scene, assembly: placementAssembly, parts: snapTargets().filter(part => !pastedGroup?.items.some(item => item.id === part.id)), moving: freePosition ?? moving, event, depth, roll, ray })
      : []
    const index = options.findIndex(option => option.key === candidate?.key)
    const sticky = options[index]
    const first = options[0]
    if (cycle && options.length) candidate = options[(index + 1) % options.length]
    else if (sticky && Boolean(sticky.fit || sticky.mesh) === Boolean(first.fit || first.mesh) && sticky.distance <= first.distance + 8) candidate = sticky
    else candidate = first
    pose = candidate?.pose ? { ...moving, ...candidate.pose } : freePosition
    scene.setGhost(pose, candidate?.point, Boolean(candidate?.failure))
    if (movesExisting && pastedGroup && pose) scene.previewParts(groupTransforms(pastedGroup.items, pastedGroup.anchor, pose))
    else scene.setGroupGhost(pose && pastedGroup ? pastedGroup.items : [], pastedGroup?.anchor, pose)
    renderHint()
  }

  function startPlacement(part, existing = false, origin, group) {
    if(existing&&[part,...(group?.items??[])].some(p=>locked(p.id))){setMessage(tr('Детали заблокированы.','Parts are locked.'));render();return}
    cancelGizmo()
    cancelPlacement()
    cancelResize()
    setMessage()
    moving = part
    pastedGroup = group
    movesExisting = existing
    const ids = new Set([part.id, ...(group?.items ?? []).map(item => item.id)])
    placementAssembly = createAssembly(existing ? state.parts : [...state.parts, part, ...(group?.items ?? [])],
      existing ? state.links.filter(link => ids.has(link.shaft.part) === ids.has(link.socket.part))
        : [...state.links, ...(group?.links ?? [])])
    if (existing) {
      scene.setMoving(part.id, true)
      const plane = new Plane(Y, -part.position[1])
      const anchor = scene.pointer(origin, false).ray.intersectPlane(plane, new Vector3())
      if (anchor) grab = { plane, anchor }
    }
    pose = null
    if (pointer) updatePointer(pointer)
    render()
  }

  function cancelPlacement() {
    cancelAnimationFrame(previewFrame)
    previewFrame = 0
    cancelBoxSelection()
    pendingPart = undefined
    if (movesExisting) {
      scene.setMoving(moving.id, false)
      if (pastedGroup) scene.setParts(state.parts)
    }
    moving = null
    placingCopy = false
    pastedGroup = null
    directDrag = null
    movesExisting = false
    grab = null
    candidate = null
    pose = null
    depth = 0
    roll = 0
    scene.setGhost(null)
    scene.setGroupGhost([])
    render()
  }

  function place() {
    if (!pose || candidate?.failure) {
      if (candidate?.failure) tutorial?.nudge('connected')
      return
    }
    const original = movesExisting ? state.parts.find(part => part.id === moving.id) : null
    if (original && samePose(original, pose) && !candidate) {
      cancelPlacement()
      cancelResize()
      return
    }
    const fit = candidate?.fit && placementAssembly.connect(candidate.shaft, candidate.socket, candidate.fit.placement)
    if (fit && !fit.ok) return
    const id = pose.id
    const copied = pastedGroup ? groupTransforms(pastedGroup.items, pastedGroup.anchor, pose) : []
    const transformed = new Map([pose, ...copied].map(part => [part.id, part]))
    const placed = original ? state.parts.map(part => transformed.get(part.id) ?? part) : [...state.parts, pose, ...copied]
    const added = fit ? [{ shaft: candidate.shaft, socket: candidate.socket, placement: fit.placement }] : []
    const pastedBelts = pastedGroup?.belts
    const previousLinks = state.links
    const meshed = Boolean(candidate?.mesh?.ok)
    const nextLinks = transformLinks(placed, [id, ...copied.map(part => part.id)],
      [...(pastedGroup?.links ?? []), ...added], Boolean(candidate?.pose))
    cancelPlacement()
    additional.clear()
    for (const part of copied) additional.add(part.id)
    selected = id
    if (isolation) isolation = new Set([...isolation, id, ...additional])
    commit({ parts: placed, links: nextLinks, belts: [...state.belts, ...(pastedBelts ?? [])] })
    const snapped = hasNewConnection(previousLinks, state.links)
    if (!original) workspaceUI.placed()
    tutorial?.handle('placed', { newPart: !original, design: pose.design })
    if (snapped) tutorial?.handle('connected')
    else tutorial?.nudge('connected')
    audio.play(meshed || snapped ? 'snap' : 'place')
  }

  function mirrorCopy(axis) {
    const anchor = pose ?? moving
    const reflect = part => mirrorPose(part, axis, anchor.position)
    const next = reflect(anchor)
    if (pastedGroup) {
      const items = groupTransforms(pastedGroup.items, pastedGroup.anchor, anchor).map(reflect)
      const copied = [next, ...items]
      const byId = new Map(copied.map(part => [part.id, part]))
      const assembly = createAssembly([...state.parts, ...copied], state.links)
      const links = []
      for (const link of pastedGroup.links) {
        const fit = connectPlaced(assembly, byId.get(link.shaft.part), byId.get(link.socket.part), link)
        if (fit.ok) links.push(connectionRecord({ ...link, fit }))
      }
      placementAssembly = assembly
      pastedGroup = { ...pastedGroup, anchor: next, items, links }
    }
    moving = next
    candidate = null
    if (pointer) updatePointer(pointer)
  }

  function turnPart([axis, direction]) {
    const part = moving
    if (!part) return
    const angle = direction * (steppedRotation ? rotationStep : freeKeyboardStep)
    const rotation = new Quaternion().setFromAxisAngle(axis, angle)
      .multiply(new Quaternion().fromArray(part.rotation)).toArray()
    const next = { ...part, rotation }
    moving = next
    if (axis === Y) roll += angle
    if (pointer) updatePointer(pointer)
  }

  function cancelGizmo() {
    if (!gizmoPart) return
    const part = gizmoPart
    gizmoPart = null
    transform = null
    gizmoRaw = null
    gizmoSnap = null
    scene.cancelGizmo()
    scene.setParts(state.parts)
    scene.setMoving(part.id, false)
    scene.setGhost(null)
    render()
  }

  function transformLinks(placed, ids, added = [], infer = false) {
    const byId = new Map(placed.map(part => [part.id, part]))
    const changed = new Set(Array.isArray(ids) ? ids : [ids])
    const attached = link => changed.has(link?.shaft?.part) || changed.has(link?.socket?.part)
    const retained = [...state.links.filter(link => !attached(link)), ...added]
    const checked = createAssembly(placed, retained)
    for (const { shaft: a, socket: b, placement: previous } of state.links.filter(attached)) {
      const shaft = byId.get(a?.part)
      const socket = byId.get(b?.part)
      if (!shaft || !socket || !previous) continue
      const fit = connectPlaced(checked, shaft, socket, { shaft: a, socket: b, placement: previous })
      if (fit.ok) retained.push(connectionRecord({ shaft: a, socket: b, fit }))
    }
    if (infer) {
      const changedParts = placed.filter(part => changed.has(part.id))
      const fixedParts = placed.filter(part => !changed.has(part.id))
      retained.push(...connectAligned(checked, changedParts, fixedParts))
    }
    return retained
  }

  function finishTransform(before, after, snap) {
    const followers = activeJoint?.moving ?? additional
    cancelGizmo()
    if (!snap && before.design === after.design && samePose(before, after)) return
    const edited = new Map([after, ...groupTransforms(state.parts.filter(item => item.id !== before.id && followers.has(item.id)), before, after)].map(part => [part.id, part]))
    const placed = state.parts.map(part => edited.get(part.id) ?? part)
    selected = after.id
    const previousLinks = state.links
    const added = snap?.fit ? [{ shaft: snap.shaft, socket: snap.socket, placement: snap.fit.placement }] : []
    commit({ parts: placed, links: transformLinks(placed, [...edited.keys()], added, Boolean(snap?.pose)) })
    if (snap?.mesh?.ok || hasNewConnection(previousLinks, state.links)) audio.play('snap')
  }

  async function snapAllParts() {
    if (el('snapAll').disabled) return
    const before = state
    const hiddenBefore = hidden
    snappingScene = true
    setMessage(t.snapAllWorking, true)
    render()
    try {
      const { snapScene } = await import('./scene-snap.js?v=volvo-spur-gears')
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (signal.aborted || state !== before || mode !== 'build' || hidden !== hiddenBefore || dragActive() || pendingPart) {
        if (message === t.snapAllWorking) setMessage()
        return
      }
      const fixed = new Set([
        ...(state.layers.lockedPartIds??[]),
        ...unknownLinks.flatMap(link => [link.shaft?.part, link.socket?.part]),
        ...hiddenBelts.flatMap(record => [record.a?.part, record.b?.part]),
      ])
      const result = snapScene(state.parts, state.links, { belts: state.belts, hidden, fixed })
      if (result.added) {
        commit({ ...state, parts: result.parts, links: result.links })
        audio.play('snap')
        if (message !== t.storage) setMessage(t.snapAllResult(result.added, result.adjusted))
      } else {
        setMessage(t.snapAllNoMatch)
      }
    } catch (error) {
      if (signal.aborted) return
      console.error(error)
      setMessage(t.snapAllError)
    } finally {
      snappingScene = false
      if (!signal.aborted) render()
    }
  }

  function clipboardSelection() {
    const part = selectedPart()
    if (!part || mode !== 'build' || dragActive()) return
    const items = state.parts.filter(item => additional.has(item.id))
    const ids = new Set(selectionIds())
    const links = state.links.filter(link => ids.has(link.shaft.part) && ids.has(link.socket.part))
    const belts = state.belts.filter(belt => ids.has(belt.a.part) && ids.has(belt.b.part))
    return structuredClone({ anchor: part, items, links, belts })
  }

  function copyPart() {
    const copy = clipboardSelection()
    if (!copy) return
    clipboard = copy
    setMessage(t.copied)
    render()
  }

  function insertCopy(group) {
    if (!group || mode !== 'build' || dragActive()) return
    const copied = [group.anchor, ...group.items].map(part => ({ ...part, id: crypto.randomUUID() }))
    const ids = new Map([group.anchor, ...group.items].map((part, i) => [part.id, copied[i].id]))
    const links = group.links.map(link => ({
      shaft: { ...link.shaft, part: ids.get(link.shaft.part) },
      socket: { ...link.socket, part: ids.get(link.socket.part) },
      placement: link.placement,
    }))
    const belts = group.belts.map(belt => ({ ...belt, id: crypto.randomUUID(),
      a: { ...belt.a, part: ids.get(belt.a.part) }, b: { ...belt.b, part: ids.get(belt.b.part) },
    }))
    const [anchor, ...items] = copied
    startPlacement(anchor, false, undefined, items.length ? { anchor, items, links, belts } : undefined)
    placingCopy = true
    renderHint()
  }

  function setTool(next) {
    if (mode !== 'build' || (next === 'length' && !canResize(selectedPart()))) return
    if (moving) return
    cancelBoxSelection()
    cancelGizmo()
    cancelResize()
    setMessage()
    const previous = tool
    tool = ['belt', 'track'].includes(next) && tool === next ? 'select' : next
    if (['belt', 'track'].includes(tool)) workspaceUI.openPanel('inspector')
    if (['belt', 'track'].includes(tool) && root.querySelector('#editor-inspector-body').hidden) {
      root.querySelector('[data-panel="inspector"] [data-panel-toggle]').click()
    }
    render()
    if (tool === 'track' && previous !== tool) {
      focusedTrack = undefined
      el('trackPanel').querySelector('[data-track="mode"]').focus({ preventScroll: true })
    }
    if (previous !== tool) {
      audio.play('tool')
      if (tool === 'belt' || tool === 'track') showEditorTip(root, tool, language, signal)
    }
  }

  function rotationJoints(id) {
    return links.filter(l => ['continuous', 'detented'].includes(l.fit.motion.rotation) && (l.shaft.part === id || l.socket.part === id))
  }

  function refreshTransmissionMap(){
    const available=mode==='kinematics'&&transmission?.ok===true
    lastMapUpdate=performance.now()
    const next=available&&mapUI.enabled?transmissionMap(transmission,selected,lastMotionPoses,state.parts.filter(p=>!hidden.has(p.id))):new Map()
    for(const id of next.keys())if(hidden.has(id))next.delete(id)
    const changed=next.size!==mappedParts.size||[...next].some(([id,key])=>mappedParts.get(id)!==key)
    mappedParts=next
    mapUI.render(mappedParts,available)
    if(mapUI.enabled&&available&&changed)updateHighlights()
  }
  function updateHighlights() {
    if(mode==='kinematics'&&mapUI.enabled&&transmission?.ok){
      scene.highlight(mappedParts.keys(),0xff6666,true,new Map([...mappedParts].map(([id,key])=>[id,transmissionCodes[key]])))
    }else scene.highlight(activeJoint?.moving ?? additional, 0xffb01b, false)
  }

  function positionHandles() {
    const handles = el('axleHandles')
    const part = resize?.pose ?? selectedPart()
    handles.hidden = mode !== 'build' || tool !== 'length' || !canResize(part) || hidden.has(part?.id) || Boolean(moving)
    if (handles.hidden) return
    const ends = axleEnds(part)
    const rectangle = el('viewport').getBoundingClientRect()
    const points = ends.map(scene.project)
    const dx = points[1].clientX - points[0].clientX
    const dy = points[1].clientY - points[0].clientY
    const span = Math.hypot(dx, dy)
    for (const [end, handle] of [...handles.children].entries()) {
      const point = points[end]
      const direction = end === 0 ? -1 : 1
      const insetX = span > 1 ? 12 * direction * dx / span : 16 * direction
      const insetY = span > 1 ? 12 * direction * dy / span : 0
      handle.hidden = !point.visible
      handle.style.left = `${point.clientX - rectangle.left + insetX}px`
      handle.style.top = `${point.clientY - rectangle.top + insetY}px`
    }
  }

  function beginResize(event) {
    const handle = event.target.closest('[data-end]')
    const part = selectedPart()
    if (!handle || event.button !== 0 || !canResize(part)) return
    event.preventDefault()
    scene.canvas.focus({ preventScroll: true })
    handle.setPointerCapture(event.pointerId)
    const end = Number(handle.dataset.end)
    const ends = axleEnds(part)
    const point = ends[end]
    const direction = point.clone().sub(ends[1 - end]).normalize()
    const from = scene.project(point)
    const to = scene.project(point.clone().addScaledVector(direction, 20))
    const dx = to.clientX - from.clientX
    const dy = to.clientY - from.clientY
    const lengthSquared = dx * dx + dy * dy
    resize = { part, end, pose: part, startX: event.clientX, startY: event.clientY,
      dx, dy, lengthSquared, lost: [],
      kept: links.filter(link => link.shaft.part === part.id || link.socket.part === part.id).length,
      pointerId: event.pointerId }
    scene.setMoving(part.id, true)
    scene.setGhost(part)
    render()
  }

  function previewResize(event) {
    if (!resize || event.pointerId !== resize.pointerId) return
    const { part, end, startX, startY, dx, dy, lengthSquared } = resize
    const distance = lengthSquared > 1
      ? 20 * ((event.clientX - startX) * dx + (event.clientY - startY) * dy) / lengthSquared
      : (end === 0 ? -1 : 1) * (event.clientX - startX)
    const pose = resizeAxle(part, end, distance)
    if (pose.design === resize.pose.design) return
    resize.pose = pose
    const placed = state.parts.map(item => item.id === part.id ? pose : item)
    resize.placed = placed
    resize.links = transformLinks(placed, part.id)
    const key = link => JSON.stringify([link.shaft, link.socket])
    const retained = new Set(resize.links.map(key))
    const original = links.filter(link => link.shaft.part === part.id || link.socket.part === part.id)
    resize.lost = original.filter(link => !retained.has(key(link)))
    resize.kept = original.length - resize.lost.length
    scene.highlight(resize.lost.map(link => link.shaft.part === part.id ? link.socket.part : link.shaft.part))
    scene.setGhost(pose)
    render()
  }

  function cancelResize() {
    if (!resize) return
    scene.setMoving(resize.part.id, false)
    resize = null
    updateHighlights()
    scene.setGhost(null)
    render()
  }

  function finishResize(event) {
    if (!resize || event.pointerId !== resize.pointerId) return
    previewResize(event)
    const { part, pose, placed, links } = resize
    cancelResize()
    if (pose.design !== part.design) commit({ parts: placed, links })
  }

  function groupTransforms(items, part, pose) {
    const rotation = new Quaternion().fromArray(pose.rotation)
      .multiply(new Quaternion().fromArray(part.rotation).invert())
    const origin = new Vector3().fromArray(part.position)
    const next = new Vector3().fromArray(pose.position)
    return items.map(item => ({
      ...item,
      position: new Vector3().fromArray(item.position).sub(origin).applyQuaternion(rotation).add(next).toArray(),
      rotation: rotation.clone().multiply(new Quaternion().fromArray(item.rotation)).toArray(),
    }))
  }

  function snapTargets() {
    return hidden.size ? state.parts.filter(part => !hidden.has(part.id)) : state.parts
  }

  function updateGizmo(cycle = false) {
    if (!gizmoPart || !gizmoRaw) return
    if (tool === 'move' && snapAllowed(pointer) && transform) {
      const members = state.parts.filter(item => additional.has(item.id))
      const options = translationSnaps([gizmoRaw, ...groupTransforms(members, gizmoPart, gizmoRaw)],
        snapTargets(), transform, scene, scene.gizmo.axis ?? '', 0)
      const previous = options.findIndex(option => option.key === gizmoSnap?.key)
      const first = options[0]
      const sticky = options[previous]
      if (cycle && first) gizmoSnap = options[(previous + 1) % options.length]
      else gizmoSnap = sticky && Boolean(sticky.pinSeat) === Boolean(first.pinSeat) &&
        sticky.shift <= first.shift + 1.5 ? sticky : first ?? null
    } else gizmoSnap = null
    const pose = gizmoSnap?.pose ? { ...gizmoRaw, ...gizmoSnap.pose } : gizmoRaw
    scene.setGhost(pose, gizmoSnap?.point)
    const followers = activeJoint?.moving ?? additional
    if (followers.size) scene.previewParts(groupTransforms(state.parts.filter(item => item.id !== gizmoPart.id && followers.has(item.id)), gizmoPart, pose))
    render()
  }

  function changeDepth(step) {
    depth += step
    el('depth').value = String(depth)
    if (pointer) updatePointer(pointer)
    else render()
  }

  function setMode(next) {
    if (next === mode) return
    workspaceUI.exitPresentation()
    if (mode === 'testDrive') drivePanel.setActive(false)
    cancelGizmo()
    cancelPlacement()
    cancelResize()
    pointerDown = null
    if (next === 'paint' && message !== t.storage) setMessage()
    releaseMotor()
    mode = next
    if(mode!=='kinematics')mapUI.clear()
    additional.clear()
    setSelection(selected)
    if (mode === 'testDrive') drivePanel.setActive(true)
    audio.play('tool')
    if (mode === 'kinematics') tutorial?.handle('kinematics')
    if (mode === 'kinematics' || mode === 'testDrive') showEditorTip(root, mode, language, signal)
  }

  function stepAnimation(time) {
    if (!frame) return
    if (!stepAnimation.previous) stepAnimation.previous = time
    const speed = transmission?.playback ?? 90
    angle += Math.min(50, time - stepAnimation.previous) * speed * motionSpeed / 1000
    stepAnimation.previous = time
    const limit = Number(el('angle').max)
    let wrappedAngle = 0
    if (transmission?.periodic && (angle >= limit || angle < 0)) {
      wrappedAngle = Math.floor(angle / limit) * limit
      angle = ((angle % limit) + limit) % limit
    }
    if (angle > limit) {
      angle = limit
      stopAnimation()
      showMotion(true)
      render()
      return
    }
    showMotion(true, wrappedAngle)
    frame = requestAnimationFrame(stepAnimation)
  }

  for (const name of modes) on(el(name), 'click', () => setMode(name))
  on(root, 'pointerdown', audio.unlock, true)
  on(root, 'pointerup', audio.unlock, true)
  on(window, 'keydown', audio.unlock, true)
  on(el('wires'), 'click', () => {
    const visible = el('wires').getAttribute('aria-pressed') !== 'true'
    el('wires').setAttribute('aria-pressed', String(visible))
    if (!visible) cablePanel.close()
    scene.setWiresVisible(visible)
    render()
  })
  on(el('sound'), 'click', () => {
    if (audio.toggle()) audio.play('tool')
    updateSoundControl()
  })
  on(el('snapAll'), 'click', snapAllParts)
  on(el('undo'), 'click', () => restore(undo, redo))
  on(el('redo'), 'click', () => restore(redo, undo))
  on(el('frame'), 'click', scene.resetView)
  on(el('paintFrame'), 'click', scene.resetView)
  on(paintColor, 'input', updatePaintSwatches)
  for (const swatch of paintSwatches) on(swatch, 'click', () => {
    paintColor.value = swatch.dataset.paint
    updatePaintSwatches()
  })
  scene.watchView(positionHandles)
  on(scene.canvas, 'bricklab-camera-interaction', () => tutorial?.handle('camera'))
  on(el('axleHandles'), 'pointerdown', beginResize)
  on(el('axleHandles'), 'pointermove', previewResize)
  on(el('axleHandles'), 'pointerup', finishResize)
  on(el('axleHandles'), 'pointercancel', cancelResize)
  on(el('name'), 'change', () => {
    if (!el('name').value.trim()) el('name').value = currentDocument().name
    persist()
  })
  on(el('save'), 'click', () => {
    const success = persist(true)
    tutorial?.handle('saved', { success })
  })
  on(el('export'), 'click', () => download(currentDocument()))
  on(el('publish'), 'click', async () => {
    if (typeof publish !== 'function' || !persist(true)) return
    const control=el('publish')
    if(control.disabled)return
    control.disabled=true
    try { await publish(currentDocument(),()=>scene.capturePublication()) }
    catch (error) { if(!signal.aborted){console.error(error);setMessage(language==='ru'?'Не удалось открыть публикацию':'Could not open publication',true)} }
    finally { if(!signal.aborted)control.disabled=false }
  })
  const connectionTools = el('connectionTools')
  const connectionToggle = connectionTools.querySelector('summary')
  for (const name of buildTools) on(el(`${name}Tool`), 'click', () => {
    if (connectionTools.open) {
      connectionTools.open = false
      if (['belt', 'track'].includes(name)) connectionToggle.focus({ preventScroll: true })
    }
    setTool(name)
  })
  on(window, 'pointerdown', event => {
    if (!connectionTools.contains(event.target)) connectionTools.open = false
  }, true)
  on(el('groupSelection'), 'click', () => { if (selected && !dragActive()) createGroup() })
  on(window, 'keyup', event => {
    if ((moving || gizmoPart) && pointer && ['Control', 'Meta'].includes(event.key)) {
      updatePointer({ clientX: pointer.clientX, clientY: pointer.clientY, ctrlKey: event.ctrlKey, metaKey: event.metaKey })
      if (gizmoPart) updateGizmo()
    }
  })
  scene.gizmo.setRotationSnap(steppedRotation ? rotationStep : null)
  on(el('pivotMode'), 'change', () => {
    cancelGizmo()
    jointMode = el('pivotMode').value === 'joint'
    render()
  })
  on(el('rotationSnap'), 'click', () => {
    steppedRotation = !steppedRotation
    writePreference('rotationSnap', steppedRotation ? 'on' : 'off')
    scene.gizmo.setRotationSnap(steppedRotation ? rotationStep : null)
    render()
  })
  on(el('snap'), 'click', () => {
    snapEnabled = !snapEnabled
    writePreference('snap', snapEnabled ? 'on' : 'off')
    if (moving && pointer) updatePointer(pointer)
    else render()
  })
  on(el('copy'), 'click', copyPart)
  on(el('paste'), 'click', () => insertCopy(clipboard))
  const context = el('partContext')
  const mirrorAxes = el('mirrorAxes')
  function refreshContext(){
    context.querySelectorAll('[data-smart-context]').forEach(n=>n.remove());const p=selectedPart();if(!p)return;const d=root.ownerDocument,header=d.createElement('div');header.dataset.smartContext='';header.className='part-context-header';header.textContent=selectionIds().length>1?tr('Выбрано: ','Selected: ')+selectionIds().length:(parts[p.design]?.[language]??p.design)+' · '+p.design;context.prepend(header);
    const ids=['paint','replace','sameDesign','sameColor','lock','group','focus','hide','isolate'];if(selectionIds().length===2)ids.unshift('connect');if(rotationMotion(p.id,state.parts,assembly)?.ok)ids.unshift('flow','play');if(canResize(p))ids.unshift('length');const commands=commandList();for(const id of ids){const c=commands.find(c=>c.id===id);if(!c)continue;const b=d.createElement('button');b.type='button';b.dataset.smartContext='';b.dataset.command=id;const iconPaths={paint:'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1',replace:'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4',sameDesign:'M3 3h7v7H3zM14 14h7v7h-7z',sameColor:'M12 2C8 8 5 11 5 15a7 7 0 0 0 14 0c0-4-3-7-7-13z',lock:'M5 10h14v11H5zM8 10V7a4 4 0 1 1 8 0v3',group:'M3 5h7l2 2h9v12H3z',focus:'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6',hide:'M3 3l18 18M2 12s4-7 10-7c6 0 10 7 10 7',isolate:'M3 3h18v18H3zM8 8h8v8H8z',connect:'M10 13l4-4m-7 1-3 3a4 4 0 0 0 6 6l3-3m-2-8 3-3a4 4 0 0 1 6 6l-3 3',flow:'M3 12h6l3-7 3 14 3-7h3',play:'M7 4l14 8-14 8z',length:'M3 12h18M7 8l-4 4 4 4m10-8 4 4-4 4'};b.innerHTML=menuIcon(iconPaths[id]??iconPaths.group);b.append(d.createTextNode(c.label));b.disabled=!c.enabled();context.insertBefore(b,context.querySelector('[data-action=delete]'))}
  }
  function positionContext(x, y) {
    context.style.left = Math.max(0, Math.min(x, window.innerWidth - context.offsetWidth)) + 'px'
    context.style.top = Math.max(0, Math.min(y, window.innerHeight - context.offsetHeight)) + 'px'
  }
  on(window, 'pointerdown', event => { if (!context.contains(event.target)) context.hidden = true }, true)
  on(window, 'keydown', event => {
    if (!context.hidden && !['Tab', 'Enter', ' ', 'Escape'].includes(event.key)) context.hidden = true
    if (!context.hidden && event.key === 'Escape') {
      context.hidden = true
      scene.canvas.focus()
      event.stopImmediatePropagation()
    }
  }, true)
  function openPartContext(event) {
    if(mode!=='build'||dragActive()||pendingPart)return false
    const hit=scene.pointer(event).hit
    if(!hit)return false
    if(!selectionIds().includes(hit))selectClick(hit)
    // Keep the basic menu usable even if an optional engineering command fails.
    context.hidden=false;mirrorAxes.hidden=true
    context.querySelector('[data-action=mirror]')?.setAttribute('aria-expanded','false')
    try{refreshContext()}catch(error){context.querySelectorAll('[data-smart-context]').forEach(n=>n.remove());console.error('Part context:',error)}
    positionContext(event.clientX,event.clientY)
    context.querySelector('button:not(:disabled)')?.focus({preventScroll:true})
    return true
  }
  bindPartContextInput({root,viewport:el('viewport'),menu:context,events:window,signal,
    enabled:()=>!simulating(mode)&&!root.hasAttribute('data-workspace-presentation'),
    open:openPartContext,
    release:(event,click)=>{if(click){if(!openPartContext(event)){cancelGizmo();cancelPlacement()}}else if(moving)updatePointer(event)}
  })
  on(context, 'click', event => {
    const button = event.target.closest('button')
    if (!button) return
    if (button.dataset.action === 'mirror') {
      mirrorAxes.hidden = !mirrorAxes.hidden
      button.setAttribute('aria-expanded', String(!mirrorAxes.hidden))
      positionContext(context.offsetLeft, context.offsetTop)
      return
    }
    context.hidden = true
    if(button.dataset.command){invokeCommand(button.dataset.command);return}
    if (button.dataset.action === 'copy') insertCopy(clipboardSelection())
    else if (button.dataset.action === 'delete') removeParts()
    else if (button.hasAttribute('data-axis')&&unlockedSelection()) {
      const ids = selectionIds()
      const center = scene.selectionCenter(ids)
      const selectedIds = new Set(ids)
      const placed = state.parts.map(p => selectedIds.has(p.id) ? mirrorPose(p, Number(button.dataset.axis), center) : p)
      commit({ ...state, parts: placed, links: transformLinks(placed, ids, [], true) })
    }
  })
  on(el('duplicate'), 'click', () => insertCopy(clipboardSelection()))
  on(el('remove'), 'click', () => removeParts())
  on(el('color'), 'change', event => {
    if (!selected || mode !== 'build' || dragActive()) return
    paintPart(selected, event.target.value)
  })
  on(el('shallower'), 'click', () => changeDepth(-2))
  on(el('deeper'), 'click', () => changeDepth(2))
  on(el('motionSpeed'),'input',e=>{motionSpeed=Number(e.target.value);el('speedValue').textContent=motionSpeed.toFixed(1)+'×'})
  on(el('motionAxis'), 'change', () => {
    angle = 0
    lastPreview = 0
    audio.resetRotation()
    scene.setParts(state.parts)
    showMotion()
  })
  on(el('angle'), 'input', event => {
    if (runningMotor?.id === selected && runningMotor) runningMotor.degrees = Number(event.target.value)
    stopAnimation()
    angle = Number(event.target.value)
    showMotion(true)
    render()
    if (hinge?.ok || transmission?.ok) tutorial?.handle('motion')
  })
  on(el('applyHinge'), 'click', () => {
    if (!hinge?.ok) return
    const target = nearestDetent(hinge.detents, angle * Math.PI / 180)
    if (Math.abs(target - hinge.roll) < 1e-8) return
    const placed = hingePoses(state.parts, hinge, target)
    commit({ parts: placed, links: transformLinks(placed, [...hinge.moving]) })
  })
  on(el('selector'), 'click', event => {
    const button = event.target.closest('[data-shift]')
    if (!button) return
    const edits = shiftSelector(selected, Number(button.dataset.shift), state.parts, assembly, selectorLinkage)
    applySelector(edits)
  })

  function applySelector(edits) {
    if (!edits) return
    const placed = state.parts.map(part => edits.get(part.id) ?? part)
    const shifted = [...edits.values()]
    const nextLinks = transformLinks(placed, [...edits.keys()], [], true)
    const ring = shifted.find(p => portsFor(p.design).some(port => port.role === 'selector-guide'))
    const checked = createAssembly(placed, nextLinks)
    if (ring) nextLinks.push(...connectAligned(checked, [ring], shifted.filter(p => p.id !== ring.id)))
    const kept = old => nextLinks.some(link => link.shaft.part === old.shaft.part &&
      link.socket.part === old.socket.part && link.socket.port === old.socket.port &&
      (link.shaft.port === old.shaft.port || old.socket.port === 'shift-groove'))
    if (assembly.connections.some(link => !kept(link) &&
        assembly.port(link.shaft.part, link.shaft.port).role !== 'clutch-driver')) {
      setMessage(language === 'ru' ? 'Переключению мешает установленное соединение.' : 'An installed connection blocks the shift.')
      render()
      return
    }
    commit({ ...state, parts: placed, links: nextLinks })
  }

  function finishSelectorDrag() {
    if (transmission?.kind !== 'selector' || !angle || !selectorLinkage) return
    const id = selectorLinkage.ring.id
    const preview = rotationPoses(state.parts, transmission, angle * Math.PI / 180)?.find(part => part.id === id)
    if (!preview) return
    const target = new Vector3(...preview.position)
    const choices = [0, -1, 1].map(direction => shiftSelector(selected, direction, state.parts, assembly, selectorLinkage))
      .filter(edits => edits?.has(id))
    const distance = edits => target.distanceToSquared(new Vector3(...edits.get(id).position))
    choices.sort((a, b) => distance(a) - distance(b))
    applySelector(choices[0])
  }
  on(el('angle'), 'change', finishSelectorDrag)
  on(el('stopRunningMotor'), 'click', () => {
    if (!runningMotor) return
    const id = runningMotor.id
    commit({ ...state, parts: state.parts.map(part => part.id === id
      ? { ...part, electric: { ...part.electric, power: 0 } } : part) })
  })
  on(el('clutchTest'), 'click', testClutch)
  on(el('play'), 'click', () => {
    if (transmission?.kind === 'motor' && transmission.playback && !runningMotor) {
      stopAnimation()
      runningMotor = { id: selected, motion: transmission, degrees: angle }
      runningMotor.frame = requestAnimationFrame(motorTick)
      render()
      return
    }
    if (frame) stopAnimation()
    else {
      audio.unlock()
      stepAnimation.previous = 0
      frame = requestAnimationFrame(stepAnimation)
      if (hinge?.ok || transmission?.ok) tutorial?.handle('motion')
    }
    render()
  })
  scene.gizmo.addEventListener('mouseDown', () => {
    gizmoPart = selectedPart()
    ignoreGizmoClick = Boolean(gizmoPart)
    if (gizmoPart) {
      const id = gizmoPart.id
      const ids = new Set(selectionIds())
      transform = createAssembly(state.parts, state.links.filter(link => ids.has(link.shaft.part) === ids.has(link.socket.part)))
      gizmoRaw = gizmoPart
      scene.setMoving(id, true)
    }
    scene.canvas.focus({ preventScroll: true })
  })
  scene.gizmo.addEventListener('objectChange', () => {
    if (!gizmoPart) return
    gizmoRaw = scene.gizmoPose(gizmoPart)
    if (activeJoint?.detents.length) {
      const delta = new Quaternion(...gizmoRaw.rotation).multiply(new Quaternion(...gizmoPart.rotation).invert())
      const turn = 2 * Math.atan2(new Vector3(delta.x, delta.y, delta.z).dot(activeJoint.axis), delta.w)
      const stop = nearestDetent(activeJoint.detents, activeJoint.roll + activeJoint.sign * turn)
      gizmoRaw = hingePoses([gizmoPart], activeJoint, stop)[0]
    }
    updateGizmo()
  })
  scene.gizmo.addEventListener('mouseUp', () => {
    if (!gizmoPart) return
    const part = gizmoPart
    const snap = gizmoSnap
    const pose = snap?.pose ? { ...gizmoRaw, ...snap.pose } : gizmoRaw
    // TransformControls clears its own dragging flag after this event.
    queueMicrotask(() => { if (gizmoPart === part) finishTransform(part, pose, snap) })
  })
  on(scene.canvas, 'pointermove', event => {
    if (!simulating(mode)) pointer = event
  }, true)
  on(scene.canvas, 'pointerdown', event => {
    if (simulating(mode) || root.hasAttribute('data-workspace-presentation')) return
    if (event.button === 2) { cancelBoxSelection(); return }
    if (event.button !== 0) return
    if (!gizmoPart) ignoreGizmoClick = false
    scene.canvas.focus({ preventScroll: true })
    if (mode === 'build' && tool === 'box' && !moving && !pendingPart) {
      pointerDown = null
      if (event.isPrimary) {
        boxSelection = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
        scene.canvas.setPointerCapture(event.pointerId)
      } else cancelBoxSelection()
      return
    }
    pointerDown = [event.clientX, event.clientY]
    if (mode === 'paint') {
      if (!event.isPrimary) pointerDown = null
      return
    }
    if (mode === 'build') {
      if (!gizmoPart && !moving && tool === 'select' && !event.shiftKey && event.pointerType !== 'touch') {
        const hit = scene.pointer(event).hit
        const part = state.parts.find(entry => entry.id === hit)
        if (part) {
          if (!selectionIds().includes(hit)) selectClick(hit)
          if(!selectionIds().some(locked))directDrag = { part, start: event }
        }
      }
      return
    }
    const hit = scene.pointer(event).hit
    const part = state.parts.find(entry => entry.id === hit)
    if (!part) return
    if (hit !== selected) setSelection(hit)
    if (!hinge?.ok && !transmission?.ok) return
    stopAnimation()
    scene.canvas.setPointerCapture(event.pointerId)
    drag = { x: event.clientX, angle, sign: hinge?.sign ?? 1 }
    render()
  })
  on(scene.canvas, 'pointermove', event => {
    if (simulating(mode) || root.hasAttribute('data-workspace-presentation')) return
    if (boxSelection?.pointerId === event.pointerId) {
      updateSelectionFrame(event)
      return
    }
    if (mode === 'paint') {
      if (pointerDown && Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]) >= 5) pointerDown = null
      return
    }
    if (drag) {
      const min = Number(el('angle').min)
      const max = Number(el('angle').max)
      const sensitivity = transmission?.solve ? Math.min(2, (max - min) / 180) : 2
      angle = Math.max(min, Math.min(max, drag.angle + (event.clientX - drag.x) * sensitivity * drag.sign))
      showMotion(true)
    } else if (directDrag && !moving && (event.buttons & 1) &&
        Math.hypot(event.clientX - directDrag.start.clientX, event.clientY - directDrag.start.clientY) >= 5) {
      const { part, start } = directDrag
      pointer = event
      const items = state.parts.filter(item => item.id !== part.id && selectionIds().includes(item.id))
      startPlacement(part, true, start, items.length ? { anchor: part, items } : undefined)
      directDrag = { part, start }
    } else if ((moving && directDrag && (event.buttons & 1)) || !event.buttons) {
      if (moving && pastedGroup?.items.length) queueGroupPreview(event)
      else updatePointer(event)
    }
  })
  on(scene.canvas, 'pointerup', event => {
    if (simulating(mode) || root.hasAttribute('data-workspace-presentation')) return
    if (event.button !== 0) return
    if (boxSelection?.pointerId === event.pointerId) {
      const bounds = updateSelectionFrame(event)
      cancelBoxSelection()
      setMessage()
      if (bounds) {
        const ids = scene.selectInRect(bounds)
        selectParts(event.shiftKey ? [...selectionIds(), ...ids] : ids)
      } else {
        selectClick(scene.pointer(event).hit, event.shiftKey)
      }
      return
    }
    const click = pointerDown && Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]) < 5
    pointerDown = null
    if (mode === 'paint') {
      if (click && event.isPrimary) paintPart(scene.pointer(event).hit, paintColor.value, event.ctrlKey || event.metaKey)
      return
    }
    if (ignoreGizmoClick) {
      ignoreGizmoClick = false
      return
    }
    if (drag) {
      finishSelectorDrag()
      drag = null
      return
    }
    const releasedPart = Boolean(directDrag && moving)
    directDrag = null
    if (moving && (click || releasedPart)) {
      updatePointer(event)
      place()
    } else if (click) {
      const hit = scene.pointer(event).hit
      if (mode === 'build' && tool === 'belt') beltPanel.pick(hit)
      else if (mode === 'build' && tool === 'track') trackPanel.pick(hit)
      else {
        if (jointMode && tool === 'rotate' && hit) {
          const joints = rotationJoints(hit)
          const distance = link => {
            const socket = state.parts.find(p => p.id === link.socket.part)
            const port = assembly.port(socket.id, link.socket.port)
            return scene.pixelDistance(worldPort(socket, port).start, event)
          }
          chosenJoint = joints.sort((a, b) => distance(a) - distance(b))[0]
        }
        selectClick(hit, event.shiftKey)
      }
    }
  })
  on(scene.canvas, 'pointercancel', () => {
    if (simulating(mode)) return
    pointerDown = null
    drag = null
    ignoreGizmoClick = false
    cancelGizmo()
    cancelPlacement()
    cancelResize()
  })
  on(scene.canvas, 'lostpointercapture', event => {
    if (boxSelection?.pointerId === event.pointerId) cancelBoxSelection()
  })
  on(window, 'keydown', event => {
    if (event.defaultPrevented || root.ownerDocument.querySelector('dialog[open]')) return
    if((event.ctrlKey||event.metaKey)&&event.code==='KeyK'){event.preventDefault();if(!event.repeat)openCommands();return}
    if (root.hasAttribute('data-workspace-presentation')) {
      if(event.key==='Escape'){event.preventDefault();workspaceUI.exitPresentation()}
      return
    }
    if (event.key === 'Escape' && connectionTools.open) {
      event.preventDefault()
      connectionTools.open = false
      connectionToggle.focus({ preventScroll: true })
      return
    }
    if (event.code === 'Slash' && !event.ctrlKey && !event.metaKey && !event.target.closest?.('input, textarea, select')) {
      const search = [...root.querySelectorAll('input[type=search]')].find(input => input.getClientRects().length)
      if (search) { event.preventDefault(); search.focus(); search.select(); return }
    }
    if (simulating(mode)) {
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS' && !event.target.closest?.('input, textarea, select')) {
        event.preventDefault()
        persist(true)
      } else if (event.key === 'Escape') setMode('build')
      return
    }
    if (event.key === 'Escape' && mode === 'paint') {
      event.preventDefault()
      setMode('build')
      el('build').focus()
      return
    }
    if (event.key === 'Escape' && mode === 'build' && tool === 'belt' && !dragActive()) {
      event.preventDefault()
      setTool('select')
      return
    }
    if (event.key === 'Escape' && boxSelection) {
      event.preventDefault()
      cancelBoxSelection()
      return
    }
    if (event.key === 'Escape' && (dragActive() || pendingPart)) {
      event.preventDefault()
      cancelGizmo()
      cancelPlacement()
      cancelResize()
      return
    }
    if (event.target.closest?.('input, textarea, select, [contenteditable]') || event.altKey) return
    if (event.ctrlKey || event.metaKey) {
      const mirrorAxis = ['KeyX', 'KeyY', 'KeyZ'].indexOf(event.code)
      if (placingCopy && event.ctrlKey && !event.shiftKey && mirrorAxis >= 0) {
        event.preventDefault()
        if (!event.repeat) mirrorCopy(mirrorAxis)
        return
      }
      const layerActions = {
        KeyA: () => selectParts(state.parts.map(part => part.id)),
        KeyG: () => { if (selected) createGroup() },
        KeyH: toggleIsolation,
      }
      if (mode === 'build' && !dragActive() && !event.shiftKey && layerActions[event.code]) {
        event.preventDefault()
        if (!event.repeat) layerActions[event.code]()
        return
      }
      if ((moving || gizmoPart) && pointer && ['Control', 'Meta'].includes(event.key)) {
        updatePointer({ clientX: pointer.clientX, clientY: pointer.clientY, ctrlKey: event.ctrlKey, metaKey: event.metaKey })
        if (gizmoPart) updateGizmo()
      }
      const actions = {
        KeyZ: () => event.shiftKey ? restore(redo, undo) : restore(undo, redo),
        KeyY: () => restore(redo, undo),
        KeyS: () => persist(true),
        KeyC: copyPart,
        KeyV: () => insertCopy(clipboard),
        KeyD: () => insertCopy(clipboardSelection()),
        KeyX: () => {
          copyPart()
          el('remove').click()
        },
      }
      const action = actions[event.code]
      if (action && (!['KeyC', 'KeyV', 'KeyD', 'KeyX'].includes(event.code) || mode === 'build')) {
        event.preventDefault()
        action()
      }
      return
    }
    if (mode !== 'build' || resize) return
    if (gizmoPart) {
      if (event.key === 'Tab' && gizmoSnap) {
        event.preventDefault()
        updateGizmo(true)
      }
      return
    }
    const turn = moving && heldTurns[event.code]
    if (turn) {
      event.preventDefault()
      if (!event.repeat || !steppedRotation) turnPart(turn)
      return
    }
    if (moving) {
      if (event.code === 'Space' || event.key === 'Enter' && !event.target.closest?.('button, a')) {
        event.preventDefault()
        place()
      } else if (event.key === 'Tab' && candidate && pointer) {
        event.preventDefault()
        updatePointer(pointer, true)
      }
      return
    }
    if (event.code === 'KeyL' && event.shiftKey && !event.repeat && selected) {
      event.preventDefault()
      const ids = new Set(selectionIds())
      const next = [...state.links, ...connectAligned(createAssembly(state.parts, state.links),
        state.parts.filter(part => ids.has(part.id)), state.parts.filter(part => !ids.has(part.id)))]
      if (next.length > state.links.length) {
        commit({ ...state, links: next })
        audio.play('snap')
      } else { setMessage(t.noAlignedPorts); render() }
      return
    }
    const step = steps[event.code]
    const part = selectedPart()
    if (step && part && !hidden.has(part.id)) {
      event.preventDefault()
      const position = part.position.map((value, axis) => value + step[axis] * snapGrid)
      finishTransform(part, { ...part, position })
      return
    }
    const actions = {
      Escape: () => setTool('select'),
      KeyV: () => setTool('select'),
      KeyB: () => setTool('box'),
      KeyG: () => setTool('move'),
      KeyH: () => { if (selected) setPartsHidden(selectionIds(), true) },
      KeyS: () => setTool('length'),
      KeyF: () => scene.focus(selectionIds()),
      KeyR: () => setTool('rotate'),
      KeyX: () => el('remove').click(),
      Delete: () => el('remove').click(),
      Backspace: () => el('remove').click(),
    }
    const action = actions[event.code]
    if (action && !event.repeat) {
      event.preventDefault()
      action()
    }
  })

  refreshLayerVisibility()
  scene.belts.set(state.belts)
  setSelection(undefined)
  scene.resetView()
  // Keep the load-time report even when the editor has discarded invalid links.
  // It is a snapshot of the import, not a claim that current geometry is still invalid.
  if(initialIssues.length){
    const ru=language==='ru',panel=el('diagnosticIssues'),make=(tag,txt)=>{const n=window.document.createElement(tag);n.textContent=txt;return n}
    const details=make('details',''),heading=make('summary',(ru?'Проблемы при загрузке':'Import issues')+' · '+initialIssues.length)
    const note=make('p',ru?'Эти записи не были приняты при открытии сборки. Нажми на запись, чтобы найти доступные детали.':'These records were rejected during import. Click an entry to locate available parts.')
    details.append(heading,note)
    for(const issue of initialIssues.slice(0,100)){
      const ids=[issue.a,issue.b].filter(id=>typeof id==='string')
      const label=(issue.kind==='belt'?(ru?'Ремень':'Belt'):(ru?'Соединение':'Connection'))+': '+(issue.a??'—')+' / '+(issue.portA??'—')+' → '+(issue.b??'—')+' / '+(issue.portB??'—')
      const b=make('button',label);b.type='button'
      on(b,'click',()=>{
        const visible=state.parts.filter(p=>ids.includes(p.id)&&!hidden.has(p.id)).map(p=>p.id)
        if(!visible.length){setMessage(ru?'Детали скрыты или отсутствуют в сцене.':'Parts are hidden or missing from the scene.');render();return}
        if(mode!=='build')setMode('build')
        selectParts(visible);scene.focus(visible)
      })
      details.append(b)
    }
    if(initialIssues.length>100)details.append(make('p',ru?'Показаны первые 100 записей.':'Showing the first 100 records.'))
    panel.append(details);panel.hidden=false
  }
  tutorial = mountTutorial(root, { projectId, language, signal })
  if (tutorial?.step === 'placed') workspaceUI.openPanel('library')
  // A resumed mechanics lesson needs kinematics mode and a selectable gear.
  // Without this, reloading during the lesson returns to Build mode and
  // the remaining steps can no longer be completed.
  if (tutorial?.mode === 'mechanics' && ['gearSelected', 'motion'].includes(tutorial.step)) {
    setMode('kinematics')
    workspaceUI.openPanel('inspector')
    if (tutorial.step === 'motion') {
      const gear = state.parts.find(part => ['10928', '3648'].includes(part.design))
      if (gear) setSelection(gear.id)
    }
  }
  const collaborationPreview=()=>{
    if(moving&&pose)return [pose,...(pastedGroup?groupTransforms(pastedGroup.items,pastedGroup.anchor,pose):[])]
    if(resize?.pose)return [resize.pose]
    if(gizmoPart&&gizmoRaw){const p=gizmoSnap?.pose?{...gizmoRaw,...gizmoSnap.pose}:gizmoRaw;const followers=activeJoint?.moving??additional;return [p,...groupTransforms(state.parts.filter(x=>x.id!==gizmoPart.id&&followers.has(x.id)),gizmoPart,p)]}
    return []
  }
  const collaborationIdle=()=>!signal.aborted&&!dragActive()&&!pendingPart&&!snappingScene&&!frame&&!runningMotor&&!clutchTest&&mode!=='testDrive'&&!window.document.querySelector('dialog[open]:not(.collaboration-dialog)')
  collaborationUI=mountCollaboration(root,{language,scene,signal,initial:collaboration,onJoin:onJoinCollaboration,read:currentDocument,preview:collaborationPreview,loadPreview:async designs=>{await Promise.allSettled(designs.filter(id=>Object.hasOwn(parts,id)&&!models.has(id)).map(id=>prepareModel(parts[id])))},idle:collaborationIdle,apply:async(next,expected)=>{
    if(!collaborationIdle())return false
    if(hiddenParts.length||next.parts.some(p=>!parts[p.design]))throw Error('invalid_shared_geometry')
    const missing=[...new Set(next.parts.map(p=>p.design))].filter(id=>!models.has(id))
    for(let i=0;i<missing.length;i+=4){await Promise.all(missing.slice(i,i+4).map(id=>prepareModel(parts[id])));if(signal.aborted)return false}
    if(!collaborationIdle()||sharedDelta(expected,currentDocument()).length)return false
    const placed=next.parts,rebuilt=createAssembly(placed,next.connections,{belts:next.belts??[]})
    if(placed.length!==next.parts.length||rebuilt.connections.length!==next.connections.length||rebuilt.belts.length!==(next.belts??[]).length)throw Error('invalid_shared_geometry')
    undo.length=redo.length=0;el('name').value=next.name;driveConfig=next.testDrive;customInstructions=next.customInstructions
    applyState({parts:placed,links:next.connections,belts:next.belts??[],layers:readSceneLayers(next.sceneLayers,new Set(placed.map(p=>p.id)))})
    return true
  }})
  reportLoad?.('scene', true)
  if (instructionReady) await instructionReady
}
