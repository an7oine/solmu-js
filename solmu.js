"use strict";

(function () {

  function Solmu() {
    /*
     * Odota, kunnes sivu on latautunut.
     */
    window.addEventListener(
      "DOMContentLoaded",
      function (e) {
        /*
         * Kuuntele kaikkia DOM-muutoksia ja reagoi niihin seuraavasti:
         *
         * - uusien [data-solmu]-elementtien sisältö päivitetään heti;
         *
         * - olemassaolevat elementit päivitetään aina, kun niiden
         *   [data-solmu*]-määreitä muutetaan.
         */
        this._muutostenTarkkailija = new MutationObserver(function (muutokset) {
          for (const muutos of muutokset) {
            if (muutos.type === 'childList') {
              for (let solmu of muutos.addedNodes)
                if (solmu.nodeType == Node.ELEMENT_NODE) {
                  this.paivitaElementti(solmu);
                }
            }
            else if (muutos.type === 'attributes') {
              if (
                muutos.attributeName.startsWith("data-solmu")
                && muutos.target.matches("[data-solmu]")
              ) {
                this._paivitaElementti(muutos.target);
              }
            }
          }
        }.bind(this));
        this._muutostenTarkkailija.observe(document.body, {
          attributes: true,
          childList: true,
          subtree: true
        });

        /*
         * Päivitä kaikki DOM:ssä jo olevat solmut.
         */
        for (let olemassaolevaSolmu of this.sisemmatSolmut(document)) {
          this._paivitaElementti(olemassaolevaSolmu);
        }
      }.bind(this),
      false
    );

    /*
     * Päivitä kaikki solmut aina, kun dokumentti vastaanottaa
     * `data-paivitetty`-sanoman.
     */
    document.addEventListener(
      "data-paivitetty",
      function (e) {
        if (document.body)
          this.paivitaElementti(document.body);
      }.bind(this),
      false
    );
  }

  // Aja ennen dokumentin sulkemista?
  //this._muutostenTarkkailija.disconnect();

  Object.assign(Solmu.prototype, {
    /*
     * Sanakirja, joka koodaa elementtityypin (tagName) siihen
     * määreeseen, joka käsittää elementin sisällön.
     * Oletuksena käytetään määrettä `innerHTML`.
     */
    ElementinSisalto: [
      ["input[type=date], input[type=time]", "valueAsDate"],
      ["input, select, option", "value"],
    ],

    /*
     * Datan esitys ja tekstiesityksen tulkinta.
     */
    esitys: {},
    tulkinta: {},
    suodatus: {},

    /*
     * Poimi elementin sisältämät, hakuun (oletuksena [data-solmu])
     * täsmäävät elementit listana siten,
     * että haku pysähtyy kunkin löytyneen elementin kohdalla
     * (vain ne jälkeläiset tutkitaan, joihin ei-q-haku täsmää;
     * oletuksena nämä ovat samat, joihin q-haku ei täsmää).
     */
    sisemmatSolmut: function (el, q, ei_q) {
      q = q ?? "[data-solmu]";
      ei_q = ei_q ?? `:not(${q})`;
      let tasmaavat = Array.from(el.querySelectorAll(
        `:scope >${q}`
      ));
      for (let jalkelainen of el.querySelectorAll(
        `:scope >${ei_q}`
      )) {
        tasmaavat = tasmaavat.concat(
          this.sisemmatSolmut(jalkelainen, q, ei_q)
        );
      }
      return tasmaavat;
    },

    /*
     * Hae tietoa annetusta datasta (oletus `document.data`) annetulla
     * avaimella.
     *
     * Tavuviiva tulkitaan sisemmän sanakirjan
     * (jonka odotetaan olevan olemassa) avaimeksi,
     * so. `sanakirja-avain` hakee arvon 42 seuraavasta datasta:
     *
     * {sanakirja: {avain: 42}}
     *
     * Mikäli taulukon (`Array`) sisältä poimitaan indeksi, tuotetaan
     * kyseinen rivi. Mikäli poimitaan muu avain, tuotetaan
     * uusi taulukko poimien annettu avain kultakin riviltä.
     */
    poimiData: function (avain, data) {
      if (avain.startsWith("-"))
        return undefined;
      data = data ?? document.data;
      let avaimet = (avain ?? "").split("-");
      for (let _avain of avaimet) {
        if (!_avain || ! data)
          break;
        else if (Array.isArray(data)) {
          if (! isNaN(_avain))
            data = data[_avain];
          else
            data = data.flatMap(function (alkio) {
              return alkio? alkio[_avain] : undefined;
            });
        }
        else
          data = data[_avain];
      }
      return data;
    },

    /*
     * Päivitä `document.data` annetulla avaimella ja arvolla.
     *
     * Tavuviiva tulkitaan sisemmän sanakirjan
     * (joka luodaan tarvittaessa) avaimeksi,
     * so. `sanakirja-avain` = 42 tuottaa tuloksena:
     *
     * {sanakirja: {avain: 42}}
     */
    asetaData: function (avain, arvo) {
      let data = document.data;
      let avaimet = avain.split("-");
      for (let _avain of avaimet.slice(0, -1)) {
        if (!_avain || ! data)
          return;
        else if (Array.isArray(data)) {
          if (! isNaN(_avain))
            data = data[_avain];
          else
            data = data.flatMap(function (alkio) {
              return alkio? alkio[_avain] : undefined;
            });
        }
        else
          data = data[_avain] ?? (data[_avain] = {});
      }
      let _avain = avaimet[avaimet.length - 1];
      if (data && _avain)
        data[_avain] = arvo;
    },

    /*
     * Muodosta tekstiesitys datalle elementtikohtaisen
     * esitysmuotofunktion tai -funktioiden perusteella.
     *
     * Mikäli (viimeinen) kutsuttu funktio palauttaa arvon,
     * asetetaan se elementin sisällöksi.
     */
    esitaData: function (el, data) {
      let arvo = data;
      if (el.dataset.solmuEsitys) {
        for (let esitys of el.dataset.solmuEsitys.split(", ")) {
          if (this.esitys[esitys])
            arvo = this.esitys[esitys].bind(this.esitys)(el, arvo);
          else if (esitys) {
            console.log(`${el.dataset.solmu}: esitys ${esitys} puuttuu.`);
            return;
          }
        }
      }
      if (arvo === undefined)
        return;
      let sisalto = el.dataset.solmuSisalto;
      if (sisalto === undefined) {
        for (const [tyyppi, _sisalto] of this.ElementinSisalto)
          if (el.matches(tyyppi)) {
            sisalto = _sisalto;
            break;
          }
        if (sisalto)
          ;
        else if (! [
          "string", "number"
        ].includes(typeof arvo))
          return;
        else
          sisalto = "textContent";
      }
      el[sisalto] = arvo;
    },

    /*
     * Tulkitse tekstiesitys loogisena arvona.
     */
    tulkitseData: function (el, data) {
      if (this.tulkinta[el.dataset.solmuTulkinta])
        return this.tulkinta[
          el.dataset.solmuTulkinta
        ].bind(this.tulkinta)(el, data);
      else if (el.dataset.solmuTulkinta)
        console.log(`${el.dataset.solmu}: tulkinta ${el.dataset.solmuTulkinta} puuttuu.`);
      return data;
    },

    /*
     * Suodata annetun taulukon rivit.
     */
    suodataData: function (el, data) {
      if (! this.suodatus[el.dataset.solmuSuodatus])
        return true;
      return this.suodatus[
        el.dataset.solmuSuodatus
      ].bind(this.suodatus)(data);
    },

    /*
     * Päivitä yksittäisen elementin sisältö.
     *
     * Oletuksena sijoitetaan elementtityyppikohtaiseen
     * tai `innerHTML`-määreeseen.
     * Mikäli `[data-solmu-sisalto]` on määritetty,
     * sijoitetaan siihen.
     */
    _paivitaElementti: function (el) {
      this.esitaData(
        el,
        this.poimiData(el.dataset.solmu)
      );
    },

    /*
     * Päivitä elementti ja sen lähimmät jälkeläiset.
     */
    paivitaElementti: function (el) {
      if (el.dataset.solmu !== undefined)
        this._paivitaElementti(el);
      for (let jalkelainen of this.sisemmatSolmut(el))
        this._paivitaElementti(jalkelainen);
    },
  });

  Object.assign(Solmu.prototype.esitys, {
    /*
     * Taulukkomuotoinen sisältö. Elementin sisältämää `.riviaihio`-elementtiä
     * monistetaan kutakin syöteriviä kohti. Näin luodun elementin solmuksi
     * asetetaan alkuperäisen elementin solmu + rivin indeksi.
     */
    rivitetty: function (el, arvo) {
      let riviaihio = solmu.sisemmatSolmut(el, ".riviaihio")[0];
      if (! riviaihio) {
        console.log(`${el.dataset.solmu}: riviaihiota ei löydy.`);
        return;
      };
      if (arvo === undefined) {
        console.log(`${el.dataset.solmu}: arvo puuttuu.`);
        return;
      }
      let olemassaolevatRivit = Object.fromEntries(
        Array.from(el.children)
        .filter(function (rivi) { return rivi.classList.contains("rivi"); })
        .map(function (rivi) { return [rivi.dataset.solmu, rivi]; })
      );

      let viimeisinLisattyRivi = riviaihio;
      if (! Array.isArray(arvo))
        arvo = Object.values(arvo ?? {});

      // Mikäli vierasavain on määritetty, haetaan kukin rivisolmu
      // sen kautta.
      // Vierasavaimen viittaman datan on oltava sanakirjamuotoista.
      let vierasavain = el.dataset.solmuVierasavain;

      let rivisolmut = [];

      for (let rivi of Array.isArray(arvo)? arvo : Object.values(arvo ?? {})) {
        let rivisolmu = [el.dataset.solmu, rivi.id].join("-");
        if (vierasavain && ! rivi) {
          console.log(`${el.dataset.solmu}: viitattua tietuetta ${arvo} ei löydy.`);
          continue;
        }
        else if (vierasavain) {
          rivisolmu = [vierasavain, rivi.id].join("-");
          rivi = window.solmu.poimiData(rivisolmu);
        }

        if (! window.solmu.suodataData(el, rivi))
          continue;

        if (rivisolmut.includes(rivisolmu)) {
          console.log(`Rivi ${rivisolmu} on kahdesti aineistossa!`);
          continue;
        }
        rivisolmut.push(rivisolmu);

        let olemassaolevaRiviEl = olemassaolevatRivit[rivisolmu];
        if (olemassaolevaRiviEl !== undefined) {
          // Päivitä olemassaoleva rivielementti.
          solmu.paivitaElementti(olemassaolevaRiviEl);
          delete olemassaolevatRivit[rivisolmu];
          viimeisinLisattyRivi = olemassaolevaRiviEl;
        }
        else {
          // Luo uusi rivielementti, lisää se viimeiseksi.
          let riviEl = riviaihio.cloneNode(true);
          riviEl.classList.remove("riviaihio");
          riviEl.classList.add("rivi");
          riviEl.setAttribute("data-solmu", rivisolmu);
          viimeisinLisattyRivi.insertAdjacentElement("afterend", riviEl);
          viimeisinLisattyRivi = riviEl;
        }
      }
      for (let poistuvaRivi of Object.values(olemassaolevatRivit)) {
        // Poista aiempi rivielementti.
        poistuvaRivi.remove();
      }
      return arvo;
    },

    /*
     * Suhteellinen, ulomman solmun viittauksesta riippuva sisältö.
     *
     * Elementin sisältämät [data-suhteellinen-solmu]-jälkeläiset käydään
     * läpi ja alkuperäisen elementin solmu lisätään niiden alkuun:
     * - mikäli `[data-suhteellinen-solmu]` on tyhjä, käytetään alkuperäistä
     *   solmua sellaisenaan
     * - mikäli se alkaa viivoilla, kutakin viivaa kohti poistetaan
     *   yksi alkuperäisen solmun hierarkiataso
     * - muut, viivoin erotetut hierarkiatasot lisätään tähän tulokseen
     */
    suhteellinen: function (el, arvo) {
      let solmu = el.dataset.solmu;
      solmu = solmu? solmu.split("-") : [];

      // Mikäli vierasavain on määritetty, haetaan suhteellinen data
      // sen kautta.
      // Vierasavaimen viittaman datan on oltava sanakirjamuotoista.
      let vierasavain = el.dataset.solmuVierasavain;
      if (vierasavain !== undefined) {
        if (! arvo)
          return;
        solmu = vierasavain.split("-").concat([arvo]);
        arvo = window.solmu.poimiData(solmu.join("-"));
      }
      for (let jalkelainen of window.solmu.sisemmatSolmut(
        el, "[data-suhteellinen-solmu]", ":not([data-suhteellinen-solmu]):not([data-solmu])"
      )) {
        let suhteellinenSolmu = jalkelainen.dataset.suhteellinenSolmu;
        if (suhteellinenSolmu) {
          let _solmu = Array.from(solmu);
          while (suhteellinenSolmu.startsWith("-")) {
            if (! _solmu.length)
              // Huomaa, että mikäli `---...` viittaa ulomman solmun
              // ulkopuolelle, sisemmälle elementille tulee `-`-alkuinen solmu.
              break;
            _solmu.pop();
            suhteellinenSolmu = suhteellinenSolmu.substring(1);
          }
          if (suhteellinenSolmu)
            _solmu = _solmu.concat(suhteellinenSolmu.split("-"));
          jalkelainen.setAttribute("data-solmu", _solmu.join("-"));
        }
        else
          jalkelainen.setAttribute("data-solmu", solmu.join("-"));
      }
      for (let jalkelainen of window.solmu.sisemmatSolmut(
        el,
        "[data-solmu]:not([data-suhteellinen-solmu])",
        ":not([data-suhteellinen-solmu]):not([data-solmu])"
      )) {
        window.solmu.paivitaElementti(jalkelainen);
      }
      return arvo;
    },
  });

  window.solmu = new Solmu();

})();
