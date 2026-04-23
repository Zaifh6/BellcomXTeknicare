// netlify/functions/lib/kb-articles.js
// Embedded knowledge base articles — bundled at deploy time.
// These mirror the .txt files in data/ which are gitignored and unavailable on Netlify.
// Add or update articles here to extend the knowledge base.

export const KB_ARTICLES = [
  {
    title: 'Empowered Pensions Commercial Rules for Leveraged FX Investment',
    content: `Empowered Pensions Commercial Rules for leveraged FX investment
These rules will be enforced from 16th June 2025 until further notice for all leveraged Foreign Exchange (FX) related investments.

Why have these rules?
Leveraged FX investments are beyond the scope of any 'normal' pension investment strategy. Whilst it is understood that exceptional investment return can be made in this field it is also clear that it is almost an inevitability that a catastrophic loss will also occur.

It is a legal requirement that Trustees make investment decisions that are suitable to the role they fulfil on behalf of the beneficiaries of the pension scheme they represent. It is also a general rule that Trustees must act with Prudence, Security and Commerciality. Finally HMRC have the 'right' to consider investments made by Trustees and where they deem them to be speculative rather than Investment they can rule that the assets are unauthorised.

Therefore, there are numerous reasons why Trustees should NOT invest in highly leveraged FX financial instruments/derivatives.

At the same time the assets can have a place in a balanced portfolio of assets that conform to the overall accepted investment risk position that the Trustees have quantified and qualified and most importantly have documented.

It is inevitable that Trustees will be called upon to provide the due diligence and supporting evidence on which they based their decision to invest in any assets and most especially high risk assets. To be unable to provide this file when requested will likely be viewed as evidence that the trustees acted incompetently.

The Risks of acting incompetently
If a trustee acts outside of their role or incompetently and this results in a loss to the beneficiaries the following can occur:
• HMRC can view the assets as unauthorised and apply the Unauthorised Payment Charge (UPC)
• HMRC may feel that the error is so grave that the trustees cannot be allowed to continue and may deem them 'Unfit'
• HMRC may view the entire scheme as to be not set up for the pension purpose it purports and may de-register the scheme, resulting in a further charge on top of the UPC
• The Pensions Ombudsman may view the Trustees as having acted incompetently and order a repayment of the lost funds from personal resources. Failure to obey the Ombudsman can result in criminal penalties
• Ultimately the law allows for state prosecution of Trustees in their personal capacity and can lead to imprisonment.

Empowered Trustees role
As you are aware, understand and have accepted, Empowered Trustees provides guidance on matters related to compliance with HMRCs rules, whilst Member Trustees seek out, research, consider and then take responsibility for the investments they wish to make.

Our guidance with highly leveraged FX is that whilst allowed it is rarely in the interests of the scheme and certainly not to any great percentage. We make this statement because of the risk that over-exposure can result (following an investigation by HMRC) with assets deemed 'Unauthorised' which crosses over into our responsibility even though 'Investment' in nature.

The positioning and rules laid out in this document are part of our warning to any would-be investor in FX.

You must:
• Identify the risk appetite of the members of your scheme and act accordingly
• Ensure that any asset chosen is part of a defined and documented investment plan, constructed with appropriate skills to balance risk and reward to the required risk tolerance
• Assess the capacity for loss and ability to recover from losses whilst maintaining the correct risk balance
• Act competently or appoint another competent party to act for you. This means you need to have the skills and experience to act, or you need to have researched and concluded that an appropriate expert act in your place
• Review the portfolio and rebalance those assets that rise in value to return the portfolio as a whole to the agreed/documented position

Rules to help you
Empowered Pensions will action investment in leveraged FX in the following circumstances:
• Member Trustees comply with the 'You must' list above, plus

Either:
• Investment does not constitute more than 15% of scheme assets across ALL leveraged FX investments of more than 30:1 AND you are self certified to be High Net Worth and/or a Sophisticated investor

Or:
• Investment does not constitute more than 15% of scheme assets across ALL leveraged FX investments of up to 30:1

• ALL investment profits are returned to the Scheme Bank account EACH MONTH, other than those needed to maintain a minimum balance requirement

• By proceeding with this investment type it is accepted by the Member Trustees that no company within the Empowered Group will be held liable for any losses, penalties, costs associated with this investment or investigations pertaining to it

• By proceeding with this investment type Member Trustees acknowledge that at no stage will it be acceptable to attempt to change the destination bank account to anything other than the agreed Scheme account

• Please note that any diversion of funds will be treated as an unauthorised payment and reported via the HMRC Gov portal without warning

• By proceeding with this investment type Member Trustees acknowledge that as your Scheme Administrator and Corporate Trustee 'Empowered' are authorised by you to obtain any information in relation to your account with the platform or the investment service provider

• By proceeding with this investment type you agree to provide your entire Due Diligence (Research) file if and when requested. Should the file be deemed to be insufficient justification you agree to hold all 'Empowered' companies to be blameless in that matter.`,
  },
];

// Simple tokenizer
function tokenize(txt) {
  return (txt || '').toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
}

// Keywords that boost the relevance score
const BOOST_KEYWORDS = [
  'risk', 'loss', 'unauthor', 'hmrc', 'trustee', 'ombudsman',
  'de-register', 'upc', 'due diligence', 'leverage', '15%',
  '30:1', 'profit', 'bank', 'transfer', 'divert', 'fx', 'pension',
  'empowered', 'investment', 'speculative', 'beneficiar',
];

/**
 * Find the best matching article from the embedded KB for a given question.
 * Returns the article content if score > 0, otherwise empty string.
 * @param {string} question
 * @returns {string}
 */
export function findInLocalKB(question) {
  const qTokens = new Set(tokenize(question));
  let best = { score: 0, content: '' };

  for (const article of KB_ARTICLES) {
    const text = article.content;
    const toks = tokenize(text);
    const lower = text.toLowerCase();

    // Token overlap score
    let score = toks.reduce((acc, t) => acc + (qTokens.has(t) ? 1 : 0), 0);

    // Keyword boost
    for (const kw of BOOST_KEYWORDS) {
      if (lower.includes(kw)) score += 2;
      if ((question || '').toLowerCase().includes(kw)) score += 3;
    }

    if (score > best.score) {
      best = { score, content: text };
    }
  }

  return best.score > 0 ? best.content : '';
}
