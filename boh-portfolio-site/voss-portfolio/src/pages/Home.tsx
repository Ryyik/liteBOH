import { Hero } from '../components/Hero'
import { SelectedWork } from '../components/SelectedWork'
import { HorizontalGallery } from '../components/HorizontalGallery'
import { About } from '../components/About'
import { Capabilities } from '../components/Capabilities'
import { Contact } from '../components/Contact'

export default function Home() {
  return (
    <main id="main">
      <Hero />
      <HorizontalGallery />
      <SelectedWork />
      <About />
      <Capabilities />
      <Contact />
    </main>
  )
}
