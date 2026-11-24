import { useId, useState, type ReactNode } from 'react'

export function SettingsTabs({ label, tabs, initial }: {
  label: string; tabs: { id: string; label: string; content: ReactNode }[]; initial?: string
}) {
  const prefix = useId()
  const [selected, setSelected] = useState(initial ?? tabs[0]?.id)
  const active = tabs.some((tab) => tab.id === selected) ? selected : tabs[0]?.id
  return <div className="settings-tabs" onInvalidCapture={(event) => {
    const input = event.target as HTMLInputElement
    const panel = input.closest('[role="tabpanel"]')
    const tab = tabs.find((item) => panel?.id === `${prefix}-panel-${item.id}`)
    if (tab && tab.id !== active) {
      event.preventDefault(); setSelected(tab.id)
      requestAnimationFrame(() => { input.focus(); input.reportValidity() })
    }
  }}>
    <div className="settings-tab-list" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab"
        id={`${prefix}-tab-${tab.id}`} aria-controls={`${prefix}-panel-${tab.id}`}
        aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1}
        onClick={() => setSelected(tab.id)} onKeyDown={(event) => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : event.key === 'ArrowRight' ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : undefined
          if (next === undefined) return
          const target = tabs[next]
          if (!target) return
          event.preventDefault()
          setSelected(target.id)
          document.getElementById(`${prefix}-tab-${target.id}`)?.focus()
        }}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <section key={tab.id} role="tabpanel" tabIndex={0}
      id={`${prefix}-panel-${tab.id}`} aria-labelledby={`${prefix}-tab-${tab.id}`}
      hidden={active !== tab.id}>{tab.content}</section>)}
  </div>
}
