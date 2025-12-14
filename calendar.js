// Custom Calendar Component for Appointment Booking
(() => {
  const CALENDLY_URL = 'https://calendly.com/sylvianebahr/30min';

  class AppointmentCalendar {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
      if (!this.container) return;

      this.currentDate = new Date();
      this.selectedDate = null;
      this.selectedTime = null;

      // Available time slots (can be customized)
      this.timeSlots = [
        '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'
      ];

      // Days when appointments are available (1=Monday, 5=Friday)
      this.availableDays = [1, 2, 3, 4, 5]; // Monday to Friday

      this.translations = {
        fr: {
          months: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
          days: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
          selectDate: 'Sélectionnez une date',
          selectTime: 'Choisissez un horaire',
          confirm: 'Réserver sur Calendly',
          selectedDate: 'Date sélectionnée',
          selectedTime: 'Horaire sélectionné',
          redirecting: 'Ouverture de Calendly...',
          prev: '‹',
          next: '›'
        },
        en: {
          months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
          days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
          selectDate: 'Select a date',
          selectTime: 'Choose a time',
          confirm: 'Book on Calendly',
          selectedDate: 'Selected date',
          selectedTime: 'Selected time',
          redirecting: 'Opening Calendly...',
          prev: '‹',
          next: '›'
        },
        es: {
          months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
          days: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
          selectDate: 'Selecciona una fecha',
          selectTime: 'Elige un horario',
          confirm: 'Reservar en Calendly',
          selectedDate: 'Fecha seleccionada',
          selectedTime: 'Horario seleccionado',
          redirecting: 'Abriendo Calendly...',
          prev: '‹',
          next: '›'
        }
      };

      this.lang = localStorage.getItem('site-lang') || 'fr';
      this.t = this.translations[this.lang] || this.translations.fr;

      this.render();
      this.attachEvents();
    }

    getLang() {
      return this.translations[localStorage.getItem('site-lang')] || this.translations.fr;
    }

    render() {
      this.t = this.getLang();
      this.container.innerHTML = `
        <div class="calendar">
          <div class="calendar__header">
            <button class="calendar__nav calendar__nav--prev" data-action="prev">${this.t.prev}</button>
            <span class="calendar__title">${this.t.months[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}</span>
            <button class="calendar__nav calendar__nav--next" data-action="next">${this.t.next}</button>
          </div>
          <div class="calendar__weekdays">
            ${this.t.days.map(d => `<span>${d}</span>`).join('')}
          </div>
          <div class="calendar__days">
            ${this.renderDays()}
          </div>
        </div>
        <div class="timeslots ${this.selectedDate ? 'timeslots--visible' : ''}">
          <p class="timeslots__title">${this.t.selectTime}</p>
          <div class="timeslots__grid">
            ${this.timeSlots.map(time => `
              <button class="timeslot ${this.selectedTime === time ? 'timeslot--selected' : ''}" data-time="${time}">${time}</button>
            `).join('')}
          </div>
        </div>
        <div class="calendar__selection ${this.selectedDate && this.selectedTime ? 'calendar__selection--visible' : ''}">
          <div class="calendar__selection-info">
            <p><strong>${this.t.selectedDate}:</strong> ${this.selectedDate ? this.formatDate(this.selectedDate) : '-'}</p>
            <p><strong>${this.t.selectedTime}:</strong> ${this.selectedTime || '-'}</p>
          </div>
          <button class="btn btn--wide calendar__confirm" ${!this.selectedDate || !this.selectedTime ? 'disabled' : ''}>${this.t.confirm}</button>
        </div>
      `;
    }

    renderDays() {
      const year = this.currentDate.getFullYear();
      const month = this.currentDate.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let days = '';

      // Empty cells for days before the first day of the month
      for (let i = 0; i < firstDay; i++) {
        days += '<span class="calendar__day calendar__day--empty"></span>';
      }

      // Days of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        const isPast = date < today;
        const isAvailable = this.availableDays.includes(dayOfWeek === 0 ? 7 : dayOfWeek) && !isPast;
        const isSelected = this.selectedDate &&
          this.selectedDate.getDate() === day &&
          this.selectedDate.getMonth() === month &&
          this.selectedDate.getFullYear() === year;

        const classes = [
          'calendar__day',
          isPast ? 'calendar__day--past' : '',
          isAvailable ? 'calendar__day--available' : '',
          isSelected ? 'calendar__day--selected' : ''
        ].filter(Boolean).join(' ');

        days += `<span class="${classes}" data-date="${year}-${month + 1}-${day}" ${isAvailable ? '' : 'disabled'}>${day}</span>`;
      }

      return days;
    }

    formatDate(date) {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const lang = localStorage.getItem('site-lang') || 'fr';
      const locales = { fr: 'fr-FR', en: 'en-US', es: 'es-ES' };
      return date.toLocaleDateString(locales[lang] || 'fr-FR', options);
    }

    attachEvents() {
      this.container.addEventListener('click', (e) => {
        const target = e.target;

        // Navigation buttons
        if (target.dataset.action === 'prev') {
          this.currentDate.setMonth(this.currentDate.getMonth() - 1);
          this.render();
          this.attachEvents();
        } else if (target.dataset.action === 'next') {
          this.currentDate.setMonth(this.currentDate.getMonth() + 1);
          this.render();
          this.attachEvents();
        }

        // Day selection
        if (target.classList.contains('calendar__day--available')) {
          const [year, month, day] = target.dataset.date.split('-').map(Number);
          this.selectedDate = new Date(year, month - 1, day);
          this.selectedTime = null;
          this.render();
          this.attachEvents();
        }

        // Time selection
        if (target.classList.contains('timeslot')) {
          this.selectedTime = target.dataset.time;
          this.render();
          this.attachEvents();
        }

        // Confirm button
        if (target.classList.contains('calendar__confirm') && this.selectedDate && this.selectedTime) {
          this.confirmBooking();
        }
      });

      // Listen for language changes
      document.getElementById('language-selector')?.addEventListener('change', () => {
        setTimeout(() => {
          this.render();
          this.attachEvents();
        }, 100);
      });
    }

    confirmBooking() {
      // Format date for Calendly URL (YYYY-MM-DD)
      const year = this.selectedDate.getFullYear();
      const month = String(this.selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(this.selectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      // Build Calendly URL with pre-selected date
      // Calendly accepts date parameter in format: ?date=YYYY-MM-DD
      const calendlyUrl = `${CALENDLY_URL}?date=${dateStr}`;

      // Open Calendly in a new tab
      window.open(calendlyUrl, '_blank');

      // Update button to show redirection message
      const t = this.getLang();
      const confirmBtn = this.container.querySelector('.calendar__confirm');
      if (confirmBtn) {
        confirmBtn.textContent = t.redirecting || 'Redirection...';
        confirmBtn.disabled = true;
      }

      // Reset after 2 seconds
      setTimeout(() => {
        this.selectedDate = null;
        this.selectedTime = null;
        this.render();
        this.attachEvents();
      }, 2000);
    }
  }

  // Initialize calendar when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    new AppointmentCalendar('appointment-calendar');
  });
})();
