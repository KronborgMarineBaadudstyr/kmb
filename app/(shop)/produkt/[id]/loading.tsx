// Vises med det samme ved klik på et produkt, mens siden hentes
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Henter produkt">
      <nav className="ls-breadcrumb"><span className="ls-skel" style={{ width: 220, height: 14 }} /></nav>
      <div className="ls-pdp">
        <div className="ls-pdp-images ls-skel" />
        <div className="ls-pdp-info">
          <div className="ls-skel" style={{ width: 90, height: 12 }} />
          <div className="ls-skel" style={{ width: '85%', height: 32 }} />
          <div className="ls-skel" style={{ width: 120, height: 28 }} />
          <div className="ls-skel" style={{ width: '100%', height: 64 }} />
          <div className="ls-skel" style={{ width: '100%', height: 48, borderRadius: 999 }} />
        </div>
      </div>
    </div>
  )
}
