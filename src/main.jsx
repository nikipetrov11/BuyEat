import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Menu from './Menu.jsx'
import Admin from './Admin.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Menu />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/:slug" element={<Menu />} />
    </Routes>
  </BrowserRouter>
)
