import chevronDown from '../../assets/landing/chevron-down-20.svg'
import { Icon } from '../landing/Icon'

const questions = [
  { question: 'Do we need any technical setup?', answer: "No. Describe your business in plain words and you're live." },
  { question: 'Which languages are supported?', answer: 'Japanese, Chinese, and Thai, plus English.' },
  { question: 'Who confirms the booking?', answer: 'Your team. Tokie takes the request, you confirm it.' },
  { question: 'Can guests call without a Korean number?', answer: 'Yes, with a free browser call from your link.' },
  { question: 'How is guest data handled?', answer: 'Call summaries are visible only to your business account.' },
]

export function BizFaq() {
  return (
    <section id="faq" className="lp-faq">
      <div className="lp-faq-inner">
        <h2 className="lp-h2 lp-reveal">Questions from businesses</h2>
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
