import dental from '../../assets/landing/cat-dental.svg'
import dermatology from '../../assets/landing/cat-dermatology.svg'
import hair from '../../assets/landing/cat-hair.svg'
import lashes from '../../assets/landing/cat-lashes.svg'
import massage from '../../assets/landing/cat-massage.svg'
import nails from '../../assets/landing/cat-nails.svg'
import plasticSurgery from '../../assets/landing/cat-plastic-surgery.svg'
import skinCare from '../../assets/landing/cat-skin-care.svg'
import { Icon } from './Icon'

const categories = [
  { label: 'Dermatology', icon: dermatology },
  { label: 'Plastic surgery', icon: plasticSurgery },
  { label: 'Skin care', icon: skinCare },
  { label: 'Hair', icon: hair },
  { label: 'Nails', icon: nails },
  { label: 'Lashes', icon: lashes },
  { label: 'Massage', icon: massage },
  { label: 'Dental', icon: dental },
]

export function Categories() {
  return (
    <section id="categories" className="lp-categories">
      <div className="lp-container">
        <div className="lp-categories-panel">
          <div className="lp-categories-copy lp-reveal">
            <h2>Plastic surgery, skin, and beauty. All in one place.</h2>
            <p className="lp-body">Search clinics that speak your language, from dermatology to hair and nail salons.</p>
          </div>
          <div className="lp-categories-list">
            <ul className="lp-category-grid">
              {categories.map(({ label, icon }, index) => (
                <li key={label}>
                  <a className={`lp-category lp-pop lp-pop--${(index % 4) + 1}`} href="#clinics">
                    <span className="lp-category-icon"><Icon src={icon} size={20} /></span>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="lp-meta">Supports Japanese, Chinese, Thai, and English.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
