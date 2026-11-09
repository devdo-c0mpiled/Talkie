import chevronDown from '../../assets/landing/chevron-down-20.svg'
import { Icon } from './Icon'

const questions = [
  { question: 'Do I need a Korean phone number?', answer: 'No. Call from your browser for free, or use your own phone.' },
  { question: 'Which languages can I speak?', answer: 'Japanese, Chinese, and Thai today. English too.' },
  { question: 'Is the call free?', answer: "Browser calls are free. Phone calls follow your carrier's rates." },
  { question: 'When is my booking final?', answer: "After the clinic confirms. You'll get a message in your language." },
  { question: 'What happens to my call?', answer: 'Your request is summarized and translated for the clinic only.' },
]

export function Faq() {
  return (
    <section id="faq" className="lp-faq">
      <div className="lp-faq-inner">
        <h2 className="lp-h2 lp-reveal">Questions before you call</h2>
        {questions.map(({ question, answer }) => (
          <details key={question}>
            <summary>{question} <Icon src={chevronDown} size={20} /></summary>
            <p className="lp-body">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
