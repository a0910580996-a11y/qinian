import { html, raw } from '../core/html.js'
import { addDays, addYears, formatDot, isValidKey, WEEKDAYS, weekday, todayKey } from '../core/dates.js'
import * as store from '../core/store.js'
import { normalizeLives, lifeName } from '../domain/life.js'
import { weekOf, TONES } from '../domain/schedule.js'
import { pageHead, segmented, field, sheetHead, sheetActions, options } from '../ui/parts.js'
import { icon } from '../ui/icons.js'
import { themeSwitch, applyTheme } from '../ui/theme.js'
import { readZip } from '../core/zip.js'
import { folderSupported, canShareFiles, exportArchiveZip, connectFolder, forgetFolder, backupNow, download, folderHandle, hasPermission, restoreAttachments } from '../ui/backup.js'
import { getConfig, saveConfig, disconnect, verify, syncNow, getStatus, onStatus, statusText, tokenUrl, newRepoUrl, defaultDeviceName } from '../ui/sync.js'
import { diffDays } from '../core/dates.js'
import { avatar, hasAvatar, makeAvatar } from '../ui/avatar.js'
import { KINDS, KIND_ORDER, setKindNames } from '../domain/library.js'
import { formatSize } from '../ui/files.js'

let editDay = null
let pendingImport = null
let pendingFiles = []
const DAY_TABS = [1, 2, 3, 4, 5, 6, 0].map(d => ({ id: String(d), name: '周' + WEEKDAYS[d] }))

function profileSection(p) {
  const input = (key, label, type = 'text', extra = '') => field(label, html`<input class="input" type="${type}" data-change="profile" data-key="${key}" value="${p[key] ?? ''}" ${extra} autocomplete="off">`)
  return html`<section class="card">
    <div class="card-head"><h2 class="card-title">个人</h2><span class="card-hint">头像、昵称、签名会出现在侧栏和今日页</span></div>
    <div class="profile-top">
      <label class="profile-avatar" title="更换头像">${avatar(p, 88)}<span class="profile-avatar-edit">更换</span><input type="file" accept="image/*" data-change="avatar" hidden></label>
      <div class="profile-main">
        ${field('昵称', html`<input class="input" data-change="profile" data-key="en" value="${p.en || ''}" maxlength="20" autocomplete="off" placeholder="问候时用">`)}
        ${field('个人签名', html`<input class="input" data-change="profile" data-key="signature" value="${p.signature || ''}" maxlength="40" autocomplete="off" placeholder="一句话，写给每天的自己">`)}
        ${hasAvatar(p) ? html`<button class="btn quiet sm" data-action="avatar-remove">移除头像，改用印章</button>` : ''}
      </div>
    </div>
    <div class="form-grid">
      ${input('name', '姓名')}${input('seal', '印章上的字', 'text', 'maxlength="1" placeholder="七"')}${input('birthday', '生日', 'date')}
      ${input('school', '学校')}${input('major', '专业')}${input('enrollYear', '入学年份', 'number', 'min="2000" max="2100"')}
    </div>
  </section>`
}

function livesSection(state) {
  const lives = normalizeLives(state.lives)
  return html`<section class="card">
    <div class="card-head"><h2 class="card-title">辈子</h2><span class="card-hint">七年一辈子；第一辈子从出生算起</span><span class="grow"></span><button class="btn quiet sm" data-action="life-new">${icon('plus')}开启新的一辈子</button></div>
    <ul class="life-rows">${lives.map((life, i) => html`<li class="life-row">
      <div class="life-row-name"><b>${life.name}</b><span class="muted small">至 ${formatDot(life.end)}</span></div>
      ${field('开始日期', html`<input class="input" type="date" data-change="life" data-start="${life.start}" data-key="start" value="${life.start}" ${i === 0 ? 'disabled title="第一辈子从生日开始"' : ''}>`)}
      ${field('主题', html`<input class="input" data-change="life" data-start="${life.start}" data-key="theme" value="${life.theme || ''}" placeholder="这辈子的目标" autocomplete="off">`)}
      ${field('信条', html`<input class="input" data-change="life" data-start="${life.start}" data-key="creed" value="${life.creed || ''}" placeholder="可不填" autocomplete="off">`)}
    </li>`)}</ul>
  </section>`
}

function scheduleSection(state, today) {
  const sc = state.schedule
  const day = editDay ?? String(weekday(today) === 0 || weekday(today) === 6 ? 1 : weekday(today))
  const slots = sc.slots[day] || {}
  const week = weekOf(sc.semester, today)
  return html`<section class="card">
    <div class="card-head"><h2 class="card-title">课程表</h2><span class="card-hint">${sc.title || ''}</span></div>
    <div class="form-grid">
      ${field('第一周的周一', html`<input class="input" type="date" data-change="semester" data-key="start" value="${sc.semester.start || ''}">`, week ? `今天是第 ${week} 周` : '今天不在学期内')}
      ${field('学期周数', html`<input class="input" type="number" min="1" max="30" data-change="semester" data-key="weeks" value="${sc.semester.weeks || ''}">`)}
    </div>
    <h3 class="subhead">节次时间</h3>
    <div class="periods">${sc.periods.map((p, i) => html`<div class="period-row"><span class="period-label">${p.label}</span><input class="input" type="time" data-change="period" data-index="${i}" data-key="start" value="${p.start}" aria-label="${p.label}开始"><span class="muted">–</span><input class="input" type="time" data-change="period" data-index="${i}" data-key="end" value="${p.end}" aria-label="${p.label}结束"></div>`)}</div>
    <h3 class="subhead">每天的安排</h3>
    ${segmented(DAY_TABS, day, 'edit-day', '选择星期')}
    <div class="slot-editor">
      <div class="slot-edit-head"><span>节次</span><span>课程</span><span>地点</span><span>颜色</span><span>备注</span><span title="地点需确认">待确认</span></div>
      ${sc.periods.map(p => {
        const s = slots[p.id] || {}
        const attrs = key => `data-change="slot" data-day="${day}" data-period="${p.id}" data-key="${key}"`
        return html`<div class="slot-edit-row" data-tone="${s.tone || 'gray'}">
          <span class="period-label"><i></i>${p.label}<small>${p.start}</small></span>
          <input class="input" ${raw(attrs('title'))} value="${s.title || ''}" placeholder="—" autocomplete="off" aria-label="${p.label}课程">
          <input class="input" ${raw(attrs('place'))} value="${s.place || ''}" placeholder="地点" autocomplete="off" aria-label="${p.label}地点">
          <select class="input" ${raw(attrs('tone'))} aria-label="${p.label}颜色">${options(TONES, s.tone || 'gray')}</select>
          <input class="input" ${raw(attrs('note'))} value="${s.note || ''}" placeholder="" autocomplete="off" aria-label="${p.label}备注">
          <input type="checkbox" class="switch" ${raw(attrs('confirm'))} ${s.confirm ? 'checked' : ''} aria-label="${p.label}地点待确认">
        </div>`
      })}
    </div>
    <p class="muted small">相邻两节内容完全相同（课程、地点、颜色、备注）时，首页会合并成一段显示。</p>
    <h3 class="subhead">停课与调休</h3>
    <form data-form="override" class="override-form">
      <input name="date" type="date" class="input" value="${today}" aria-label="日期">
      <select name="type" class="input" aria-label="类型"><option value="off">停课</option>${[1, 2, 3, 4, 5, 6, 0].map(d => html`<option value="${d}">按周${WEEKDAYS[d]}上课</option>`)}</select>
      <input name="label" class="input" maxlength="20" placeholder="说明，如 国庆调休" autocomplete="off">
      <button class="btn quiet">${icon('plus')}添加</button>
    </form>
    ${sc.overrides.length ? html`<ul class="rows">${[...sc.overrides].sort((a, b) => a.date.localeCompare(b.date)).map(o => html`<li class="row"><span class="row-main static"><span class="row-name">${formatDot(o.date)} 周${WEEKDAYS[weekday(o.date)]}</span><span class="row-sub">${o.type === 'off' ? '停课' : `按周${WEEKDAYS[o.as]}上课`}${o.label ? ' · ' + o.label : ''}</span></span><button class="icon-btn sm" data-action="override-delete" data-value="${o.date}" aria-label="删除">${icon('close')}</button></li>`)}</ul>` : ''}
    <h3 class="subhead">课程表说明</h3>
    <textarea class="input" rows="4" data-change="notes">${sc.notes.join('\n')}</textarea>
  </section>`
}

function dataSection(state) {
  const last = state.settings.lastBackup
  const backup = state.settings.backup || {}
  const fileCount = state.library.items.reduce((n, i) => n + (i.files?.length || 0), 0)
  return html`<section class="card">
    <div class="card-head"><h2 class="card-title">数据与备份</h2></div>
    <p>记录和附件平时保存在<b>这台设备的这个浏览器</b>里（${store.storageKind()}）。浏览器只是工作副本，真正的档案要放到你自己的地方：电脑上用备份文件夹交给百度网盘，手机上导出后存进网盘 App。网站不上传、不同步、没有任何统计代码。</p>
    <p class="muted">上次备份：${last ? formatDot(last) : '还没有'} · 图书馆附件 ${fileCount} 个 · <span data-region="storage">正在计算占用空间…</span></p>

    <div class="backup-box">
      <h3 class="subhead">备份文件夹${folderSupported() ? '' : ' · 需要电脑上的 Chrome 或 Edge'}</h3>
      ${folderSupported()
        ? backup.folder
          ? html`<p>已连接：<b>${backup.folder}</b></p>
              <div class="button-row">
                <button class="btn primary" data-action="backup-now">${icon('download')}立即备份</button>
                <button class="btn quiet" data-action="restore-attachments">补回缺失的附件</button>
                <button class="btn quiet" data-action="backup-connect">更换文件夹</button>
                <button class="btn quiet" data-action="backup-forget">断开</button>
              </div>
              <label class="field field-inline backup-auto"><span class="field-label">页面切走或关闭时，自动备份数据（不含附件）</span><input type="checkbox" class="switch" data-change="backup-auto" ${backup.auto !== false ? 'checked' : ''}></label>`
          : html`<p class="muted">选一个电脑上的文件夹（比如在 D 盘新建“人生档案”），网站会把完整档案写进去：表格、文字、附件原件、每天一份数据快照。再在百度网盘电脑客户端里把这个文件夹设为自动备份，档案就会进网盘。</p>
              <div class="button-row"><button class="btn primary" data-action="backup-connect">${icon('download')}选择备份文件夹</button></div>`
        : html`<p class="muted">手机和部分浏览器不能直接写文件夹。用下面的“导出完整档案”，再分享或保存到百度网盘 App。</p>`}
    </div>

    <h3 class="subhead">导出与导入</h3>
    <div class="button-row">
      <button class="btn ${folderSupported() ? 'quiet' : 'primary'}" data-action="export-zip">${icon('download')}导出完整档案（.zip）</button>
      ${canShareFiles() ? html`<button class="btn quiet" data-action="share-zip">${icon('upload')}分享到网盘</button>` : ''}
      <button class="btn quiet" data-action="export">只备份数据（.json）</button>
    </div>
    <div class="button-row">
      <label class="btn quiet">${icon('upload')}从备份恢复（.zip / .json）<input type="file" accept="application/json,.json,application/zip,.zip" data-change="import-file" hidden></label>
      ${folderSupported() ? html`<label class="btn quiet">${icon('upload')}从备份文件夹恢复<input type="file" webkitdirectory data-change="import-folder" hidden></label>` : ''}
    </div>
    <p class="muted small">完整档案不依赖这个网站：账本是 Excel 能打开的表格，日志、感恩、图书馆是文字，附件是原件，里面还有一份能原样导回来的数据。只备份数据是一个很小的 .json，不含附件。</p>
    <p class="muted small">手机上：在浏览器菜单里选“添加到主屏幕”，以后像 App 一样打开，断网也能用；iPhone 上这样做还能避免 Safari 自动清理网站数据。</p>
    <p class="muted small">写错了不用慌：每次改动后，提示条上都有“撤销”；电脑上按 Ctrl+Z（Mac 上 ⌘+Z）可以一步步撤回这次打开以来的改动。导入备份也能撤回。</p>
  </section>`
}

// GitHub Pages 上的网址自带用户名（xxx.github.io），可以用来预填仓库。
const pageOwner = () => (location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : '')

function syncBody(cfg, today) {
  const s = getStatus()
  if (!cfg) {
    const owner = pageOwner()
    return html`<div class="card-head"><h2 class="card-title">跨设备同步</h2><span class="card-hint">手机和电脑用同一份记录</span></div>
      <p>记录会同步到<b>你自己的私有 GitHub 仓库</b>：两边各自改动时逐条合并，每次同步留一个版本，几十年的修改都能翻回去；仓库里还有能直接阅读的表格和文字。附件太大不进仓库，靠备份文件夹。</p>
      <ol class="steps">
        <li><b>新建一个私有仓库</b>，名字建议叫 qinian-data，一定选 Private。<a class="btn quiet sm" href="${newRepoUrl('qinian-data')}" target="_blank" rel="noopener">打开 GitHub 新建页面 ↗</a></li>
        <li><b>生成一个只能访问这个仓库的令牌</b>：打开后在 Repository access 选“Only select repositories”，勾上 qinian-data；Contents 已预设为读写，有效期一年。<a class="btn quiet sm" href="${tokenUrl(owner || '')}" target="_blank" rel="noopener">打开令牌生成页面 ↗</a></li>
        <li><b>把仓库和令牌填在下面</b>。令牌只保存在这台设备上，不会进备份，也不会进仓库。</li>
      </ol>
      <form data-form="sync-connect" class="sync-form">
        ${field('仓库', html`<input name="repo" class="input" autocomplete="off" value="${owner ? `${owner}/qinian-data` : ''}" placeholder="你的用户名/qinian-data">`)}
        ${field('令牌', html`<input name="token" type="password" class="input" autocomplete="off" placeholder="github_pat_…">`)}
        ${field('这台设备叫', html`<input name="device" class="input" maxlength="20" autocomplete="off" value="${defaultDeviceName()}">`)}
        <button class="btn primary">验证并开始同步</button>
      </form>
      <p class="muted small">每台设备都要连接一次，可以用同一个令牌。</p>`
  }
  const age = cfg.connectedAt ? diffDays(cfg.connectedAt, today) : 0
  return html`<div class="card-head"><h2 class="card-title">跨设备同步</h2><span class="card-hint sync-state is-${s.state}">${statusText(s)}</span></div>
    <p>仓库 <b>${cfg.owner}/${cfg.repo}</b> · 这台设备叫 <b>${cfg.device || '这台设备'}</b></p>
    ${s.state === 'choice'
      ? html`<div class="sync-choice"><p>云端已经有记录，这台设备上也有自己的记录。怎么办？</p>
          <div class="button-row"><button class="btn primary" data-action="sync-choice" data-value="merge">合并两边（都保留）</button><button class="btn quiet" data-action="sync-choice" data-value="remote">以云端为准（替换这台设备上的）</button></div></div>`
      : ''}
    ${age > 330 ? html`<p class="warn">令牌是 ${age} 天前设置的，一年有效期快到了。重新生成一个，断开后再连接即可。</p>` : ''}
    <div class="button-row">
      <button class="btn primary" data-action="sync-now" ${s.state === 'syncing' ? 'disabled' : ''}>立即同步</button>
      <a class="btn quiet" href="https://github.com/${cfg.owner}/${cfg.repo}/commits" target="_blank" rel="noopener">在 GitHub 上看历史 ↗</a>
      <button class="btn quiet danger" data-action="sync-disconnect">断开</button>
    </div>
    <label class="field field-inline backup-auto"><span class="field-label">自动同步（改动后一分钟、页面切走时、每五分钟）</span><input type="checkbox" class="switch" data-change="sync-auto" ${cfg.auto !== false ? 'checked' : ''}></label>`
}

async function refreshSync(ctx) {
  const el = document.querySelector('[data-region="sync"]')
  if (!el) return
  ctx.patch('sync', syncBody(await getConfig(), ctx.today))
}

function namesSection(state) {
  const names = state.settings.kindNames || {}
  return html`<section class="card">
    <div class="card-head"><h2 class="card-title">图书馆的名字</h2><span class="card-hint">不喜欢可以改，编号会跟着变</span></div>
    <div class="form-grid">${KIND_ORDER.map(kind => field(`${KINDS[kind].noun}`, html`<input class="input" data-change="kind-name" data-kind="${kind}" maxlength="6" autocomplete="off" value="${names[kind] || ''}" placeholder="${KINDS[kind].name}">`))}</div>
  </section>`
}

// 从备份里的文件清单找出数据和附件：支持新的“人生档案”结构（附件/索引.json）、
// 旧的 files/<id> 结构，以及被重新压缩、外面多套了一层文件夹的情况。
async function readBackupEntries(entries) {
  const json = entries.filter(e => /(^|\/)data\.json$/.test(e.name)).sort((a, b) => a.name.length - b.name.length)[0]
  if (!json) throw new Error('备份里没有 data.json')
  const prefix = json.name.slice(0, -'data.json'.length)
  const data = JSON.parse(await json.blob.text())
  const byName = new Map(entries.map(e => [e.name, e.blob]))
  const metas = new Map((data.library?.items || []).flatMap(i => i.files || []).map(f => [f.id, f]))
  const indexBlob = byName.get(`${prefix}附件/索引.json`)
  const index = indexBlob ? JSON.parse(await indexBlob.text()) : {}
  const files = []
  for (const [id, meta] of metas) {
    const blob = byName.get(prefix + (index[id] || '')) || byName.get(`${prefix}files/${id}`)
    if (blob && (index[id] || byName.has(`${prefix}files/${id}`))) files.push({ id, blob, name: meta.name, type: meta.type })
  }
  return { data, files, missing: metas.size - files.length }
}

function confirmImport(ctx, title, data, files, missing) {
  if (typeof data?.version !== 'number') throw new Error('这不是人生中台的备份')
  pendingImport = data
  pendingFiles = files
  ctx.openSheet(html`<div class="sheet-form">
    ${sheetHead('从备份恢复', title)}
    <p>备份里有：${importSummary(data)}${files.length ? `，以及 ${files.length} 个附件` : ''}。${missing ? html`<span class="warn">有 ${missing} 个附件在备份里找不到。</span>` : ''}</p>
    <p class="warn">恢复会<b>替换</b>这台设备上现有的全部数据（恢复后可以撤销）。如果现有数据也重要，先导出一份。</p>
    <div class="sheet-actions"><button type="button" class="btn quiet" data-action="export-zip">先导出现有数据</button><span class="grow"></span><button type="button" class="btn ghost" data-action="close-sheet">取消</button><button type="button" class="btn danger" data-action="confirm-import">替换并恢复</button></div>
  </div>`)
}

function importSummary(data) {
  return [
    `${data.ledger?.entries?.length || 0} 笔账`,
    `${Object.keys(data.timelog || {}).length} 天时间日志`,
    `${Object.keys(data.gratitude || {}).length} 天感恩`,
    `${data.library?.items?.length || 0} 条藏书`,
    `${data.practice?.length || 0} 条练习`
  ].join('、')
}

export default {
  render(ctx) {
    const { state, today } = ctx
    return html`
      ${pageHead('设置', '改动会自动保存')}
      <div class="settings">
        ${profileSection(state.profile)}
        ${livesSection(state)}
        ${scheduleSection(state, today)}
        <section class="card">
          <div class="card-head"><h2 class="card-title">外观</h2><span class="card-hint">默认跟随系统；也可以固定为浅色或深色</span></div>
          ${themeSwitch(state.settings.theme || 'auto')}
        </section>
        <section class="card" data-region="sync"><p class="muted">正在读取同步设置…</p></section>
        ${namesSection(state)}
        ${dataSection(state)}
        <section class="card about">
          <div class="card-head"><h2 class="card-title">关于</h2></div>
          <p>七年 —— ${state.profile.name ? `${state.profile.name}的` : '你的'}人生中台。它存在的唯一理由，是帮你更好地工作和生活。</p>
          <p class="muted small">快捷键（今日与复盘页）：← → 切换日期 · T 回到今天 · G 跳到某一天。手机上左右轻扫切换日期。</p>
        </section>
      </div>`
  },
  mount(root, ctx) {
    refreshSync(ctx)
    const off = onStatus(() => refreshSync(ctx))
    store.storageEstimate().then(estimate => {
      const el = document.querySelector('[data-region="storage"]')
      if (el) el.textContent = estimate ? `本站已用 ${formatSize(estimate.usage || 0)}，浏览器允许约 ${formatSize(estimate.quota || 0)}` : '这个浏览器不提供空间信息'
    })
    return () => off()
  },
  actions: {
    'edit-day': ({ ctx, value }) => {
      editDay = value
      ctx.rerender()
    },
    'override-delete': ({ ctx, value }) =>
      ctx.undoable('已删除', s => {
        s.schedule.overrides = s.schedule.overrides.filter(o => o.date !== value)
      }),
    export: ({ ctx }) => {
      const today = todayKey()
      ctx.update(s => {
        s.settings.lastBackup = today
      }, { render: false, record: false })
      download(new Blob([store.exportJSON()], { type: 'application/json' }), `qinian-${today}.json`)
      ctx.rerender()
      ctx.toast('数据已导出（不含附件），存到稳妥的地方')
    },
    // 完整备份：data.json + files/附件。附件按块计算校验，不会把大视频整个读进内存。
    'export-zip': async ({ ctx }) => {
      ctx.toast('正在打包…')
      try {
        const zip = await exportArchiveZip()
        download(zip.blob, zip.name)
        ctx.update(s => {
          s.settings.lastBackup = todayKey()
        }, { record: false })
        ctx.toast(`完整档案已导出 · ${zip.count} 个附件${zip.missing ? `（${zip.missing} 个本机找不到）` : ''}。记得存进百度网盘`)
      } catch (error) {
        ctx.toast('打包失败：' + (error.message || '空间不足'))
      }
    },
    'share-zip': async ({ ctx }) => {
      ctx.toast('正在打包…')
      try {
        const zip = await exportArchiveZip()
        await navigator.share({ files: [new File([zip.blob], zip.name, { type: 'application/zip' })], title: zip.name })
        ctx.update(s => {
          s.settings.lastBackup = todayKey()
        }, { record: false })
        ctx.toast('已交给分享面板，选百度网盘保存')
      } catch (error) {
        if (error.name !== 'AbortError') ctx.toast('分享失败：' + (error.message || '这个浏览器不支持分享文件'))
      }
    },
    'backup-now': ({ ctx }) => backupNow(ctx),
    'avatar-remove': ({ ctx }) => {
      ctx.update(s => {
        s.profile.avatar = ''
      })
      ctx.toast('已改用印章')
    },
    'restore-attachments': async ({ ctx }) => {
      const handle = await folderHandle()
      if (!handle || !(await hasPermission(handle, true))) return ctx.toast('没有拿到备份文件夹的读取权限')
      try {
        const r = await restoreAttachments(handle)
        ctx.toast(r.restored ? `补回了 ${r.restored} 个附件${r.missing ? `，还有 ${r.missing} 个文件夹里也没有` : ''}` : r.missing ? `缺的 ${r.missing} 个附件，备份文件夹里也没有` : '附件都在，不用补')
        ctx.rerender()
      } catch (error) {
        ctx.toast(error.message || '读取备份文件夹失败')
      }
    },
    'sync-now': async ({ ctx }) => {
      const result = await syncNow()
      if (result?.error) ctx.toast(result.error.message)
      else if (result?.needsChoice) refreshSync(ctx)
      else ctx.toast(result?.changes ? `同步好了 · 合并了 ${result.changes} 处改动` : '同步好了')
    },
    'sync-choice': async ({ ctx, value }) => {
      const result = await syncNow({ choice: value })
      if (result?.error) ctx.toast(result.error.message)
      else ctx.toast(value === 'remote' ? '已换成云端的记录' : `两边合并好了${result?.changes ? ` · ${result.changes} 处改动` : ''}`)
    },
    'sync-disconnect': async ({ ctx }) => {
      await disconnect()
      refreshSync(ctx)
      ctx.toast('已断开同步。仓库里的记录还在，这台设备上的也还在')
    },
    'backup-connect': async ({ ctx }) => {
      let handle
      try {
        handle = await connectFolder()
      } catch {
        return
      }
      ctx.update(s => {
        s.settings.backup = { folder: handle.name, auto: s.settings.backup?.auto !== false }
      }, { record: false })
      backupNow(ctx)
    },
    'backup-forget': async ({ ctx }) => {
      await forgetFolder()
      ctx.update(s => {
        s.settings.backup = {}
      }, { record: false })
      ctx.toast('已断开，文件夹里的档案不会被删除')
    },
    'life-new': ({ ctx }) => {
      const lives = normalizeLives(ctx.state.lives)
      const last = lives[lives.length - 1]
      const start = addDays(addYears(last.start, 7), 0)
      ctx.openSheet(html`<form data-form="life-new" class="sheet-form">
        ${sheetHead(`开启${lifeName(lives.length + 1)}`, '上一辈子会在新一辈子开始的前一天结束')}
        ${field('开始日期', html`<input name="start" type="date" class="input" value="${start}">`)}
        ${field('这辈子的主题', html`<input name="theme" class="input" maxlength="40" autocomplete="off" autofocus>`)}
        ${sheetActions('开启')}
      </form>`)
    },
    'confirm-import': async ({ ctx }) => {
      if (!pendingImport) return
      try {
        for (const f of pendingFiles) await store.putFile(f.id, new File([f.blob], f.name || f.id, { type: f.type || '' }))
        store.replaceWith(pendingImport, todayKey())
        applyTheme(store.getState().settings.theme)
        setKindNames(store.getState().settings.kindNames)
        ctx.closeSheet()
        ctx.toast(`已导入备份${pendingFiles.length ? ` · ${pendingFiles.length} 个附件` : ''}`)
      } catch (error) {
        ctx.toast(error.message)
      }
      pendingImport = null
      pendingFiles = []
    }
  },
  changes: {
    profile: ({ el, ctx }) => {
      const key = el.dataset.key
      const value = key === 'enrollYear' ? Number(el.value) || null : el.value.trim()
      if (key === 'birthday' && !isValidKey(value)) return ctx.toast('生日格式不对')
      ctx.update(s => {
        const before = s.profile[key]
        s.profile[key] = value
        if (key === 'birthday') {
          const first = [...s.lives].sort((a, b) => a.start.localeCompare(b.start))[0]
          if (first && first.start === before) first.start = value
        }
      })
    },
    life: ({ el, ctx }) => {
      const { start, key } = el.dataset
      if (key === 'start' && !isValidKey(el.value)) return ctx.toast('日期格式不对')
      ctx.update(s => {
        const life = s.lives.find(l => l.start === start)
        if (life) life[key] = key === 'start' ? el.value : el.value.trim()
      })
    },
    semester: ({ el, ctx }) => {
      const key = el.dataset.key
      if (key === 'start' && el.value && !isValidKey(el.value)) return ctx.toast('日期格式不对')
      ctx.update(s => {
        s.schedule.semester[key] = key === 'weeks' ? Number(el.value) || null : el.value
      })
    },
    period: ({ el, ctx }) => {
      if (!/^\d{2}:\d{2}$/.test(el.value)) return ctx.toast('时间格式不对')
      ctx.update(
        s => {
          s.schedule.periods[Number(el.dataset.index)][el.dataset.key] = el.value
        },
        { render: false }
      )
    },
    slot: ({ el, ctx }) => {
      const { day, period, key } = el.dataset
      ctx.update(
        s => {
          const slots = (s.schedule.slots[day] ||= {})
          const slot = (slots[period] ||= {})
          slot[key] = key === 'confirm' ? el.checked : el.value.trim()
          if (!slot.title) delete slots[period]
        },
        { render: false }
      )
      if (key === 'tone') el.closest('.slot-edit-row').dataset.tone = el.value
    },
    notes: ({ el, ctx }) =>
      ctx.update(
        s => {
          s.schedule.notes = el.value.split('\n').map(x => x.trim()).filter(Boolean)
        },
        { render: false }
      ),
    avatar: async ({ el, ctx }) => {
      const file = el.files?.[0]
      el.value = ''
      if (!file) return
      try {
        const data = await makeAvatar(file)
        ctx.update(s => {
          s.profile.avatar = data
        })
        ctx.toast('头像换好了')
      } catch (error) {
        ctx.toast(error.message)
      }
    },
    'kind-name': ({ el, ctx }) => {
      ctx.update(s => {
        s.settings.kindNames = { ...s.settings.kindNames, [el.dataset.kind]: el.value.trim() }
        setKindNames(s.settings.kindNames)
      })
      ctx.toast('已改名')
    },
    'sync-auto': async ({ el }) => {
      const cfg = await getConfig()
      if (cfg) await saveConfig({ ...cfg, auto: el.checked })
    },
    'backup-auto': ({ el, ctx }) =>
      ctx.update(s => {
        s.settings.backup = { ...s.settings.backup, auto: el.checked }
      }, { render: false, record: false }),
    'import-file': async ({ el, ctx }) => {
      const file = el.files?.[0]
      el.value = ''
      if (!file) return
      try {
        if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
          const { data, files, missing } = await readBackupEntries(await readZip(file))
          confirmImport(ctx, file.name, data, files, missing)
        } else confirmImport(ctx, file.name, JSON.parse(await file.text()), [], 0)
      } catch (error) {
        ctx.toast(error instanceof SyntaxError ? '文件内容不对，读不出数据' : error.message)
      }
    },
    // 直接选备份文件夹恢复：不用先压缩。
    'import-folder': async ({ el, ctx }) => {
      const list = [...(el.files || [])]
      el.value = ''
      if (!list.length) return
      try {
        const entries = list.map(f => ({ name: f.webkitRelativePath.split('/').slice(1).join('/') || f.name, blob: f }))
        const { data, files, missing } = await readBackupEntries(entries)
        confirmImport(ctx, list[0].webkitRelativePath.split('/')[0], data, files, missing)
      } catch (error) {
        ctx.toast(error instanceof SyntaxError ? '文件内容不对，读不出数据' : error.message)
      }
    }
  },
  forms: {
    'sync-connect': async ({ data, form, ctx }) => {
      const match = data.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').match(/^([\w.-]+)\/([\w.-]+)$/)
      if (!match) return ctx.toast('仓库写成“用户名/仓库名”，比如 yourname/qinian-data')
      const token = data.token.trim()
      if (!token) return ctx.toast('把生成的令牌粘贴进来')
      const button = form.querySelector('button')
      button.disabled = true
      button.textContent = '正在验证…'
      const cfg = { owner: match[1], repo: match[2], token, device: data.device.trim() || defaultDeviceName(), auto: true, connectedAt: ctx.today }
      try {
        const info = await verify(cfg)
        await saveConfig({ ...cfg, branch: info.branch })
      } catch (error) {
        button.disabled = false
        button.textContent = '验证并开始同步'
        return ctx.toast(error.message || '验证失败')
      }
      const result = await syncNow()
      refreshSync(ctx)
      if (result?.error) ctx.toast(result.error.message)
      else if (!result?.needsChoice) ctx.toast('连接好了，记录已同步到你的私有仓库')
    },
    override: ({ data, ctx }) => {
      if (!isValidKey(data.date)) return ctx.toast('日期格式不对')
      ctx.update(s => {
        s.schedule.overrides = s.schedule.overrides.filter(o => o.date !== data.date)
        s.schedule.overrides.push(data.type === 'off' ? { date: data.date, type: 'off', label: data.label.trim() } : { date: data.date, type: 'as', as: Number(data.type), label: data.label.trim() })
      })
      ctx.toast('已添加')
    },
    'life-new': ({ data, ctx }) => {
      if (!isValidKey(data.start)) return ctx.toast('日期格式不对')
      const lives = normalizeLives(ctx.state.lives)
      if (data.start <= lives[lives.length - 1].start) return ctx.toast('新的一辈子要晚于上一辈子开始')
      ctx.update(s => {
        s.lives.push({ start: data.start, theme: data.theme.trim() })
      })
      ctx.closeSheet()
      ctx.toast('新的一辈子，开始了')
    }
  }
}
