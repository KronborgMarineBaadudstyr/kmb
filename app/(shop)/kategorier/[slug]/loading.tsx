// Vises med det samme ved klik på en kategori, mens siden hentes
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Henter kategori">
      <nav className="ls-breadcrumb"><span className="ls-skel" style={{ width: 220, height: 14 }} /></nav>
      <div className="ls-skel" style={{ height: 140, borderRadius: 16, marginBottom: 24 }} />
      <div className="ls-prodgrid">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="ls-skel" style={{ aspectRatio: '3 / 4', borderRadius: 16 }} />)}
      </div>
    </div>
  )
}
