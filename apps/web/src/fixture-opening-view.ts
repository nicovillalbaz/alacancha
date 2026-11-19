import type { FixtureOpening } from './fixture-start.ts';
import './fixture-opening-view.css';

const fixtureRows = '.position-game,.workspace-announced .announced-match,.fixture-day-match';

export function showFixtureOpening(root: HTMLElement, opening: FixtureOpening, isCurrent: () => boolean) {
  if (!opening.matches.length || !isCurrent() || root.querySelector(fixtureRows)) return;
  const screen = document.createElement('main');
  screen.className = 'fixture-opening';
  const title = document.createElement('div');
  title.className = 'fixture-opening-title';
  title.textContent = opening.tournament;
  const body = document.createElement('section');
  const heading = document.createElement('h1');
  heading.textContent = 'Fixture';
  const day = document.createElement('h2');
  day.textContent = opening.day;
  body.append(heading,day);
  for (const match of opening.matches) {
    const row = document.createElement('div');
    row.className = 'fixture-opening-match';
    const home = document.createElement('strong');
    const score = document.createElement('span');
    const away = document.createElement('strong');
    home.textContent = match.home;
    score.textContent = match.score;
    away.textContent = match.away;
    row.append(home,score,away);
    body.append(row);
  }
  screen.append(title,body);

  const observer = new MutationObserver(() => {
    if (!isCurrent() || root.querySelector(fixtureRows) || root.querySelector('[role="alert"]')) close();
  });
  const limit = setTimeout(close,8_000);
  function close() {
    clearTimeout(limit);
    observer.disconnect();
    screen.remove();
    root.classList.remove('fixture-opening-hidden');
    root.inert = false;
  }
  root.inert = true;
  root.classList.add('fixture-opening-hidden');
  root.before(screen);
  observer.observe(root,{childList:true,subtree:true});
  return close;
}
