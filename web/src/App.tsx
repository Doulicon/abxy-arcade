import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import About from './pages/About';
import Admin from './pages/Admin';
import Account from './pages/Account';
import Favorites from './pages/Favorites';
import GameDetail from './pages/GameDetail';
import Home from './pages/Home';
import Library from './pages/Library';
import Login from './pages/Login';
import Platforms from './pages/Platforms';
import Play from './pages/Play';
import SeriesDetail from './pages/SeriesDetail';
import { EmptyState } from './components/ui';
import { useI18n } from './i18n';

function NotFound() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl px-4 py-24">
      <EmptyState
        title={t('state.notFound')}
        description={t('state.notFoundDesc')}
        action={
          <Link to="/" className="btn btn-primary">
            {t('nav.home')}
          </Link>
        }
      />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/play/:id" element={<Play />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/platforms" element={<Platforms />} />
        <Route path="/game/:id" element={<GameDetail />} />
        <Route path="/series/:id" element={<SeriesDetail />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/account" element={<Account />} />
        <Route path="/about" element={<About />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/login" element={<Login mode="login" />} />
        <Route path="/register" element={<Login mode="register" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
