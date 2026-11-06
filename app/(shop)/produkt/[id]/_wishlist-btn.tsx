'use client'

type Props = {
  name:   string
  price?: number | null
  image?: string | null
}

export function WishlistBtn({ name, price, image }: Props) {
  function handleClick() {
    const url = window.location.href
    const params = new URLSearchParams({
      url,
      title: name,
      ...(price     ? { price: String(Math.round(price)) } : {}),
      ...(image     ? { imageurl: image }                  : {}),
    })
    window.open(`https://www.onskeskyen.dk/wish/add?${params.toString()}`, '_blank', 'noopener')
  }

  return (
    <button className="ls-wishlist-btn" onClick={handleClick} title="Tilføj til ønskeseddel på Ønskeskyen.dk">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      Ønskeliste
    </button>
  )
}
