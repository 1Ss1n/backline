import { cn } from '../lib/utils'

/**
 * Version légère de l'effet Text Fill d'ObsidianUI : le texte est révélé par
 * un dégradé animé sans interrompre le calage temporel des paroles.
 */
export default function TextFillAnimation({ children, filled = false, className }) {
  return <span className={cn('text-fill-animation', filled && 'is-filled', className)}>{children}</span>
}
